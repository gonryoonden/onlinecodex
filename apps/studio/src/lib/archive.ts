import JSZip from "jszip";
import { validateProject, type Project } from "./project";
export async function sha256(data: Uint8Array) {
  const buffer = new Uint8Array(data).buffer;
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function fromDataURL(url: string) {
  return Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
}
export function toDataURL(bytes: Uint8Array, mime: string) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192)
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(bin)}`;
}
export async function projectZip(input: Project) {
  const p = structuredClone(validateProject(input));
  const zip = new JSZip();
  const assets: Record<string, unknown> = {};
  for (const [id, a] of Object.entries(p.assets)) {
    const bytes = fromDataURL(a.dataUrl);
    const path = `assets/${id}.${a.mime.split("/")[1]}`;
    zip.file(path, bytes);
    const { dataUrl: _data, ...meta } = a;
    void _data;
    assets[id] = { ...meta, path, sha256: await sha256(bytes) };
  }
  for (const page of p.pages)
    for (const el of page.elements)
      if (el.type === "image") {
        if (!el.assetId) throw new Error("이미지 에셋 연결이 없습니다.");
        el.src = `asset:${el.assetId}`;
      }
  zip.file("project.json", JSON.stringify({ ...p, assets }, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
export async function importZip(file: Blob): Promise<Project> {
  if (file.size > 100 * 1024 * 1024)
    throw new Error("ZIP은 100MB 이하여야 합니다.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files);
  let declared = 0;
  for (const entry of entries) {
    if (
      entry.name.includes("..") ||
      entry.name.startsWith("/") ||
      entry.name.includes("\\")
    )
      throw new Error("잘못된 ZIP 경로");
    declared +=
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0;
  }
  if (entries.length > 20000 || declared > 200 * 1024 * 1024)
    throw new Error("ZIP 압축 해제 한도 초과");
  const json = zip.file("project.json");
  if (!json) throw new Error("project.json이 없습니다.");
  const raw = JSON.parse(await json.async("string"));
  if (raw.schemaVersion !== 1) throw new Error("지원하지 않는 프로젝트 버전");
  if (!raw.assets || typeof raw.assets !== "object")
    throw new Error("에셋 목록 누락");
  for (const [id, unknownAsset] of Object.entries(raw.assets)) {
    const a = unknownAsset as Record<string, unknown>;
    if (
      !/^[a-zA-Z0-9_-]+$/.test(id) ||
      typeof a.path !== "string" ||
      !new RegExp(`^assets/${id}\\.(png|jpeg|webp)$`).test(a.path)
    )
      throw new Error("잘못된 에셋 경로");
    const entry = zip.file(a.path);
    if (!entry) throw new Error(`누락된 에셋: ${id}`);
    const bytes = await entry.async("uint8array");
    if (bytes.length > 18 * 1024 * 1024 || (await sha256(bytes)) !== a.sha256)
      throw new Error(`에셋 손상: ${id}`);
    a.dataUrl = toDataURL(bytes, String(a.mime));
  }
  for (const page of raw.pages ?? [])
    for (const el of page.elements ?? [])
      if (el.type === "image") {
        if (!raw.assets[el.assetId])
          throw new Error(`누락된 이미지 에셋: ${el.assetId}`);
        el.src = raw.assets[el.assetId].dataUrl;
      }
  const p = validateProject(raw);
  const { verifyAsset } = await import("./imports");
  for (const asset of Object.values(p.assets)) await verifyAsset(asset);
  return p;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
