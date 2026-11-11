import { z } from "zod";
import type { AnyElement } from "../types";
import type { Region } from "./schema";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const kind = z.enum(["text", "shape", "image"]);
const item = z.object({ id, type: kind, regionId: id.optional(), role: z.enum(["editable", "pending", "background", "unclassified"]).optional(), reason: z.enum([
  "user-excluded", "unreviewed", "overlap", "complex-boundary", "large-or-edge",
  "hidden", "removed-since-reconstruction", "original-preserved", "duplicate", "background-pending", "separation-failed",
]).optional() });
export const stageSchema = z.object({
  name: z.enum(["ai-raw", "normalized", "reviewed", "reconstructed", "saved", "visible-export", "pptx"]),
  objects: z.array(item).max(500), omitted: z.array(item).max(500),
  counts: z.object({ text: z.number().int().min(0), shape: z.number().int().min(0), image: z.number().int().min(0) }),
});
export type Stage = z.infer<typeof stageSchema>;
export type TraceItem = Stage["objects"][number];
export const diagnosticSchema = z.object({
  version: z.literal(1), runId: id, sourceId: id, createdAt: z.string().max(40),
  provider: z.string().max(100), build: z.string().max(100).optional(),
  inputKind: z.enum(["unknown", "text-only", "illustrated"]),
  mode: z.enum(["preserve", "redraw", "local-repair", "independent"]),
  candidates: z.array(z.object({id,type:kind,status:z.enum(["generated","merged","correction-needed","separation-failed","user-excluded"]),decision:z.enum(['ready','warning','review','failed']).optional(),evidence:z.object({interiorBackgroundFraction:z.number().finite().optional(),directionalDisagreementP95:z.number().finite().optional()}).optional(),canonicalId:id.optional(),parentId:id.optional(),elementId:id.optional(),reason:z.string().max(200).optional(),maskOrigin:z.enum(["analysis","manual","local","segmenter"]).optional(),extraction:z.enum(["native","polygon","model-mask","flat-key","learned-mask"]).optional(),repair:z.object({method:z.enum(["flat-fill","directional-inpaint"]),rect:z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()]),radius:z.number().int().min(0).max(12)}).optional(),background:z.enum(["pending","local-flat","manual-flat","inpaint-review"])})).max(80).optional(),
  status: z.enum(["full-editable", "partial-editable", "original-preserved", "review-required", "failed"]),
  background: z.enum(["original", "local-patches", "inpaint-approximation", "redrawn"]),
  transport: z.object({ width: z.number().int().positive(), height: z.number().int().positive(),
    mime: z.enum(["image/png", "image/jpeg", "image/webp"]), characters: z.number().int().positive(),
    originalWidth: z.number().int().positive(), originalHeight: z.number().int().positive(),
    compressed: z.boolean(), quality: z.number().min(0).max(1).optional(),
  }).optional(),
  stages: z.array(stageSchema).max(7), warnings: z.array(z.string().max(200)).max(100),
  pptxVerifiedAt: z.string().max(40).optional(),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export function elementItems(elements: AnyElement[]): TraceItem[] {
  return elements.map(e=>({id:e.id,type:e.type==="text"?"text":e.type==="image"?"image":"shape",regionId:e.provenance?.regionId,
    role:e.provenance?.regionId?(!e.visible&&e.provenance.backgroundWarning?"pending":"editable"):e.provenance?.source&&e.type==="image"&&e.locked?"background":"unclassified"}));
}
export function snapshotStage(name: Stage["name"], objects: TraceItem[], omitted: TraceItem[] = []): Stage {
  // Allowlist serialization: never copy OCR text, images, arbitrary model fields or credentials.
  const safe = objects.map(o=>item.parse(o)), excluded=omitted.map(o=>item.parse(o));
  return {name,objects:safe,omitted:excluded,counts:{text:safe.filter(o=>o.type==="text").length,
    shape:safe.filter(o=>o.type==="shape").length,image:safe.filter(o=>o.type==="image").length}};
}
export function unexplainedLosses(before: Stage, after: Stage) {
  const present=new Set([...after.objects.flatMap(o=>[o.id,...(o.regionId?[o.regionId]:[])]),...after.omitted.filter(o=>o.reason).map(o=>o.id)]);
  return before.objects.filter(o=>!present.has(o.id)).map(o=>o.id);
}
export function assessInventory(regions: Pick<Region,"type">[], inputKind: Diagnostic["inputKind"]) {
  const warnings: string[]=[];
  if(inputKind==="illustrated"&&!regions.some(r=>r.type==="image"))warnings.push("ILLUSTRATIONS_MISSING");
  if(inputKind==="unknown"&&!regions.some(r=>r.type==="image"))warnings.push("CHECK_INPUT_KIND_IMAGE_ZERO");
  if(inputKind!=="text-only")warnings.push("CHECK_CARDS_CHARTS_AND_SHADOWS");
  return warnings;
}
export function withLiveStages(trace: Diagnostic, elements: AnyElement[], stage: "saved" | "visible-export") {
  const previous=trace.stages.find(s=>s.name==="reconstructed");
  const removed=previous?.objects.filter(o=>!elements.some(e=>e.id===o.id)).map(o=>({...o,reason:"removed-since-reconstruction" as const}))??[];
  const hidden=elements.filter(e=>!e.visible).map(e=>({...elementItems([e])[0],reason:"hidden" as const}));
  const current=snapshotStage(stage,elementItems(stage==="saved"?elements:elements.filter(e=>e.visible)),[...removed,...(stage==="saved"?[]:hidden)]);
  const order = ["ai-raw","normalized","reviewed","reconstructed","saved","visible-export","pptx"];
  const exported = trace.stages.find(s=>s.name==="pptx");
  const visible=elements.filter(e=>e.visible);
  const mismatch=exported&&(exported.objects.length!==visible.length||visible.some(e=>!exported.objects.some(o=>o.id===e.id)));
  return {...trace,warnings:[...trace.warnings.filter(w=>w!=="PPTX_SNAPSHOT_DIFFERS"),...(mismatch?["PPTX_SNAPSHOT_DIFFERS"]:[])],
    stages:[...trace.stages.filter(s=>s.name!==stage),current].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name))};
}
export function textContrast(color: string, background: string) {
  const lum=(hex:string)=>{const rgb=hex.slice(1).match(/../g)!.map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const a=lum(color),b=lum(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
export const statusLabels: Record<Diagnostic["status"],string> = {
  "full-editable":"전체 편집 가능", "partial-editable":"부분 편집 가능 · 사용자 검토 필요",
  "original-preserved":"원본 유지 · 편집 객체 미생성", "review-required":"사용자 검토 필요", "failed":"변환 실패",
};
export const warningLabels: Record<string,string> = {
  LOCAL_INPAINT_APPROXIMATION:"객체 마스크 주변의 알려진 색으로 숨은 배경을 추정했습니다. 그림자·질감·기하 경계와 이음새를 검토하세요. 정밀 복원 보장이 아닙니다.",
  INDEPENDENT_APPROXIMATION:"독립 객체와 배경 복원을 분리했습니다. 단색 복원·픽셀 키잉은 근사이며 경계·그림자를 검토하세요.",
  BACKGROUND_REPAIR_FAILED:"배경 처리에 실패해 추출 후보를 숨김 상태로 보존했습니다. 원본은 유지됩니다.",
  BACKGROUND_PENDING:"배경 미복원 후보는 숨겨서 보존했습니다. 원본 잔상과 겹치지 않도록 영역을 교정하세요.",
  MANUAL_FLAT_BACKGROUND:"수동 단색 교정: 질감·그림자는 복원하지 않았습니다. 이동·삭제 후 경계 이음새를 확인하세요.",
  ILLUSTRATIONS_MISSING:"삽화가 있는 입력인데 이미지 영역이 0개입니다. 원본을 보존하고 누락 영역을 지정하세요.",
  CHECK_INPUT_KIND_IMAGE_ZERO:"이미지 영역이 0개입니다. 텍스트 전용 입력인지 확인하세요.",
  CHECK_CARDS_CHARTS_AND_SHADOWS:"카드·표·차트·그림자가 영역 목록에 빠지지 않았는지 원본과 비교하세요.",
  GLOBAL_BACKGROUND_LOSS:"전체 배경 재작성: 미탐지·제외한 그림과 카드가 사라질 수 있습니다.",
  LOW_TEXT_CONTRAST:"일부 텍스트가 복원 배경과 구분되지 않습니다. 색상과 영역을 확인하세요.",
  PPTX_SNAPSHOT_DIFFERS:"마지막 PPTX 검증 이후 표시 객체가 달라졌습니다. 현재 상태로 다시 출력하세요.",
};
