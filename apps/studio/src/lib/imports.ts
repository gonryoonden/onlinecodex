import { uid, createImageElement, createPage, type PageData } from "./types";
import type { Asset } from "./project";
export const MAX_IMAGE_BYTES = 18 * 1024 * 1024;
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 디코딩 실패"));
    img.src = src;
  });
}
export function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
export async function verifyAsset(a: Asset) {
  const bytes = Uint8Array.from(atob(a.dataUrl.split(",")[1]), (c) =>
    c.charCodeAt(0),
  );
  if (sniff(bytes) !== a.mime)
    throw new Error("이미지 MIME과 실제 파일 형식이 다릅니다.");
  const img = await loadImage(a.dataUrl);
  if (
    img.naturalWidth !== a.width ||
    img.naturalHeight !== a.height ||
    a.width * a.height > 40_000_000
  )
    throw new Error("이미지 해상도 정보 오류 또는 40MP 초과");
}
export async function imageAsset(file: File): Promise<Asset> {
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error("이미지는 18MB 이하여야 합니다.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime || file.type !== mime)
    throw new Error("실제 PNG/JPEG/WebP 파일만 허용합니다.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
  const img = await loadImage(dataUrl);
  if (
    img.naturalWidth > 12000 ||
    img.naturalHeight > 12000 ||
    img.naturalWidth * img.naturalHeight > 40_000_000
  )
    throw new Error("이미지는 40MP 및 한 변 12000px 이하여야 합니다.");
  return {
    id: uid("asset"),
    name: file.name,
    mime: mime as Asset["mime"],
    width: img.naturalWidth,
    height: img.naturalHeight,
    dataUrl,
    original: true,
  };
}
export function placeAsset(a: Asset, width: number, height: number) {
  const scale = Math.min(1, width / a.width, height / a.height);
  return createImageElement(a.dataUrl, a.width, a.height, {
    assetId: a.id,
    name: a.name,
    width: a.width * scale,
    height: a.height * scale,
    x: (width - a.width * scale) / 2,
    y: (height - a.height * scale) / 2,
    radius: 0,
  });
}
export interface ImportResult {
  assets: Asset[];
  pages: PageData[];
  notice: string;
}
export interface DocumentImporter {
  accepts(file: File): boolean;
  import(file: File, width: number, height: number): Promise<ImportResult>;
}
export const pdfImporter: DocumentImporter = {
  accepts: (f) => f.type === "application/pdf",
  async import(file, width, height) {
    if (file.size > 40 * 1024 * 1024)
      throw new Error("PDF는 40MB 이하여야 합니다.");
    const header = new TextDecoder().decode(
      (await file.arrayBuffer()).slice(0, 5),
    );
    if (header !== "%PDF-") throw new Error("올바른 PDF가 아닙니다.");
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    const doc = await task.promise;
    try {
      if (doc.numPages > 30) throw new Error("PDF는 30페이지 이하여야 합니다.");
      const pages: PageData[] = [];
      const assets: Asset[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        if (viewport.width * viewport.height > 40_000_000)
          throw new Error("PDF 페이지가 너무 큽니다.");
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const a: Asset = {
          id: uid("asset"),
          name: `${file.name} · ${i}`,
          mime: "image/png",
          width: canvas.width,
          height: canvas.height,
          dataUrl: canvas.toDataURL("image/png"),
          original: true,
        };
        assets.push(a);
        pages.push({
          ...createPage(),
          elements: [placeAsset(a, width, height)],
        });
      }
      return {
        assets,
        pages,
        notice:
          "PDF 페이지를 이미지로 가져왔습니다. 원본 PDF 개체는 자동으로 편집 객체가 되지 않습니다.",
      };
    } finally {
      await task.destroy();
    }
  },
};
