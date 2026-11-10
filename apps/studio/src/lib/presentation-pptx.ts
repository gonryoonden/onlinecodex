import JSZip from "jszip";
import { fromDataURL } from "./archive";
import { validateProject, type Project } from "./project";
import { exportCheckpoint, exportSize, presentationFrame, type ExportOptions } from "./export-options";

const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const emu = (px: number) => Math.round(px * 9525);
type Renderer = (page: Project["pages"][number], width: number, height: number, options: ExportOptions) => Promise<string>;

/** Presentation only. Web project/ZIP remains the editable original.
 * Independent of the experimental native-object writer and server Python. */
export async function exportPresentationPPTX(input: Project, options: ExportOptions = {},
  dependencies?: { template: Uint8Array; render: Renderer }): Promise<Blob> {
  const p = validateProject(input);
  const frame = presentationFrame(p.width,p.height);
  await exportCheckpoint(options, 0, p.pages.length);
  let bytes = dependencies?.template;
  if (!bytes) {
    const response = await fetch("/native-pptx-template.pptx", { signal: options.signal });
    if (!response.ok) throw new Error("PPTX 템플릿을 불러올 수 없습니다.");
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const render = dependencies?.render ?? (await import("./render")).renderPage;
  const zip = await JSZip.loadAsync(bytes);
  const read = async (name: string) => {
    const file = zip.file(name);
    if (!file) throw new Error("PPTX 템플릿 구조 오류");
    return file.async("string");
  };
  const presentation = await read("ppt/presentation.xml");
  const rels = await read("ppt/_rels/presentation.xml.rels");
  const contentTypes = await read("[Content_Types].xml");
  const layout = (await read("ppt/slides/_rels/slide1.xml.rels"))
    .match(/<Relationship(?=[^>]*Type="[^"]*\/slideLayout")[^>]*\/>/)?.[0];
  if (!layout) throw new Error("PPTX 슬라이드 레이아웃이 없습니다.");
  // The bundled template has one empty slide. Replace the slide collection.
  zip.remove("ppt/slides");
  const rid = Math.max(1, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map(m => +m[1])) + 1;
  zip.file("ppt/presentation.xml", presentation
    .replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${p.pages.map((_, i) => `<p:sldId id="${256+i}" r:id="rId${rid+i}"/>`).join("")}</p:sldIdLst>`)
    .replace(/<p:sldSz\b[^>]*\/>/, `<p:sldSz cx="${emu(frame.width)}" cy="${emu(frame.height)}" type="cust"/>`));
  zip.file("ppt/_rels/presentation.xml.rels", rels
    .replace(/<Relationship(?=[^>]*Type="[^"]*\/slide")[^>]*\/>/g, "")
    .replace("</Relationships>", p.pages.map((_, i) => `<Relationship Id="rId${rid+i}" Type="${R}/slide" Target="slides/slide${i+1}.xml"/>`).join("") + "</Relationships>"));
  let ct = contentTypes.replace(/<Override(?=[^>]*PartName="\/ppt\/slides\/slide\d+\.xml")[^>]*\/>/g, "");
  if (!ct.includes('Extension="png"')) ct = ct.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
  zip.file("[Content_Types].xml", ct.replace("</Types>", p.pages.map((_, i) => `<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("") + "</Types>"));
  const size = exportSize(p.width, p.height, options.scale ?? 2, p.pages.length);
  let totalBytes = 0;
  for (const [i, page] of p.pages.entries()) {
    await exportCheckpoint(options, i, p.pages.length);
    const png = fromDataURL(await render(page, p.width, p.height, { ...options, scale: size.scale }));
    // Reject truncated/failed canvas output, and bound retained compressed assets.
    if (png.length < 33 || png[0] !== 137 || String.fromCharCode(...png.slice(1,4)) !== "PNG")
      throw new Error(`${i+1}페이지 이미지 출력 실패`);
    totalBytes += png.byteLength;
    if (totalBytes > 80 * 1024 * 1024) throw new Error("출력이 80MB를 초과합니다. 해상도 또는 페이지 수를 줄이세요.");
    zip.file(`ppt/media/page-${i+1}.png`, png);
    zip.file(`ppt/slides/slide${i+1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${A}" xmlns:p="${P}" xmlns:r="${R}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="Studio presentation page ${i+1}" descr="Edit this page in Personal Magic Studio using the project ZIP."/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId100"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(frame.image.x)}" y="${emu(frame.image.y)}"/><a:ext cx="${emu(frame.image.width)}" cy="${emu(frame.image.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    zip.file(`ppt/slides/_rels/slide${i+1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL}">${layout}<Relationship Id="rId100" Type="${R}/image" Target="../media/page-${i+1}.png"/></Relationships>`);
  }
  await exportCheckpoint(options, p.pages.length, p.pages.length);
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, () => options.signal?.throwIfAborted());
  options.signal?.throwIfAborted();
  return blob;
}
