// Reconstruction flow adapted from Canvix reconstruct.ts (MIT). PNG masks and honest background state replace JPEG crops.
import {
  createImageElement,
  createTextElement,
  createShapeElement,
  createLineElement,
  createPage,
  uid,
  type AnyElement,
  type Background,
} from "../types";
import { loadImage } from "../imports";
import { fitSource } from "../image-layout";
import { type Analysis, analysisSchema, toPixels, type Region } from "./schema";
import type { Asset } from "../project";
import { planLocalReplacement, applyLocalPatches } from "./preservation";
import { refineFlatEdges } from "./flat-edge";
import { flatBackgroundMask } from "./local-detect";
import { snapshotStage, elementItems, assessInventory, unexplainedLosses, textContrast, type Diagnostic, type TraceItem } from "./diagnostics";
export async function maskedCrop(source: HTMLImageElement, region: Region) {
  const [sx, sy, sw, sh] = toPixels(
    region.bbox,
    source.naturalWidth,
    source.naturalHeight,
  );
  // Integer, one-to-one source pixels. Padding leaves transparent room around masks.
  const pad = region.polygon || region.maskPng ? 2 : 0;
  const left = Math.max(0, Math.floor(sx) - pad);
  const top = Math.max(0, Math.floor(sy) - pad);
  const right = Math.min(source.naturalWidth, Math.ceil(sx + sw) + pad);
  const bottom = Math.min(source.naturalHeight, Math.ceil(sy + sh) + pad);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, right - left);
  canvas.height = Math.max(1, bottom - top);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 사용 불가");
  ctx.drawImage(
    source,
    left,
    top,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (region.polygon) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    for (let i = 0; i < region.polygon.length; i++) {
      const [x, y] = region.polygon[i];
      const px = (x * source.naturalWidth) / 1000 - left,
        py = (y * source.naturalHeight) / 1000 - top;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#000";
    ctx.fill();
  }
  if (region.maskPng) {
    const mask = await loadImage(region.maskPng);
    if (mask.naturalWidth * mask.naturalHeight > 4194304)
      throw new Error("PNG 마스크가 너무 큽니다.");
    const alpha = document.createElement("canvas");
    alpha.width = canvas.width;
    alpha.height = canvas.height;
    const ac = alpha.getContext("2d");
    if (!ac) throw new Error("Canvas 사용 불가");
    ac.drawImage(mask, sx - left, sy - top, sw, sh);
    const pixels = ac.getImageData(0, 0, alpha.width, alpha.height);
    // Google masks encode foreground probability in grayscale, not PNG alpha.
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i + 3] = Math.round(pixels.data[i] * pixels.data[i + 3] / 255);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
    }
    ac.putImageData(pixels, 0, 0);
    const original = region.edgeRefinement ? ctx.getImageData(0,0,canvas.width,canvas.height) : undefined;
    // Never apply flat-color estimation to textured or transparent perimeters.
    if(original && flatBackgroundMask(original.data,canvas.width,canvas.height)) {
      const maskValues=new Uint8Array(canvas.width*canvas.height);
      for(let i=0;i<maskValues.length;i++)maskValues[i]=pixels.data[i*4+3];
      original.data.set(refineFlatEdges(original.data,canvas.width,canvas.height,maskValues).data);
      ctx.putImageData(original,0,0);
    } else {
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(alpha, 0, 0);
    }
  }
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    sourcePixels: [left, top, canvas.width, canvas.height] as [
      number,
      number,
      number,
      number,
    ],
  };
}
export interface RepairedSource {
  background: string;
  objectSource: string;
  width: number;
  height: number;
  warning: string;
}
export async function reconstructDesign(
  input: Analysis,
  source: Asset,
  width: number,
  height: number,
  skip: string[],
  confirmedBackground: boolean,
  provider = "manual",
  repair?: RepairedSource,
  options: { mode?: "preserve" | "redraw"; inputKind?: Diagnostic["inputKind"]; initial?: Partial<Diagnostic> } = {},
) {
  const originalAnalysis = analysisSchema.parse(input);
  let analysis = originalAnalysis;
  const mode = options.mode ?? "preserve";
  const hadRepair = Boolean(repair);
  let retained: TraceItem[] = [];
  let localPatchCount = 0;
  let lowContrast = false;
  if (mode === "preserve" && !repair) {
    const original = await loadImage(source.dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 사용 불가");
    ctx.drawImage(original, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const plan = planLocalReplacement(pixels.data, source.width, source.height, analysis.regions, skip, confirmedBackground);
    pixels.data.set(applyLocalPatches(pixels.data, source.width, plan.patches));
    ctx.putImageData(pixels, 0, 0);
    retained = plan.retained; localPatchCount = plan.patches.length;
    lowContrast = plan.accepted.some(r => {
      if (r.type !== "text") return false;
      const patch = plan.patches.find(p => p.id === r.id)!;
      return textContrast(r.style?.color ?? "#172C35", "#"+patch.color.map(c=>c.toString(16).padStart(2,"0")).join("")) < 3;
    });
    // Erasure and editable replacement are committed together. Rejected text is NEVER overlaid.
    analysis = { ...analysis, regions: plan.accepted };
    repair = { background: canvas.toDataURL("image/png"), objectSource: source.dataUrl,
      width: source.width, height: source.height,
      warning: localPatchCount ? "부분 편집: 확인한 단색 영역만 지웠습니다. 경계·숨은 배경은 추정이며 이동·삭제 후 검토하세요."
        : "원본 유지: 배경 제거가 확인되지 않은 영역은 중복 글자 없이 원본에 남겼습니다." };
  }
  const img = await loadImage(repair?.objectSource ?? source.dataUrl);
  if (repair && (repair.width !== source.width || repair.height !== source.height ||
      img.naturalWidth !== source.width || img.naturalHeight !== source.height))
    throw new Error("복원 이미지 크기가 원본과 다릅니다. 다시 보정하세요.");
  const fit = fitSource(source.width, source.height, width, height);
  const elements: AnyElement[] = [];
  const assets: Asset[] = [];
  const warnings: string[] = [];
  let background: Background = {
    type: "solid",
    color: analysis.background.from,
  };
  const unsafe = analysis.background.kind === "complex" || !confirmedBackground;
  if (repair) {
    const restored = await loadImage(repair.background);
    if (restored.naturalWidth !== source.width || restored.naturalHeight !== source.height)
      throw new Error("복원 배경 크기가 원본과 다릅니다.");
    const asset: Asset = { id: uid("asset"), name: mode === "preserve" && !hadRepair ? "원본 보존 배경 · 부분 편집" : "로컬 복원 배경 · 검토 필요",
      mime: "image/png", dataUrl: repair.background, width: source.width,
      height: source.height, original: false };
    assets.push(asset);
    elements.push(createImageElement(asset.dataUrl, asset.width, asset.height, {
      x: fit.x, y: fit.y, width: fit.width, height: fit.height, radius: 0,
      assetId: asset.id, locked: true, name: asset.name,
      provenance: { source: source.id, method: hadRepair ? "local-inpaint-approximation" : "source-preserved-local-patches", review: true, backgroundWarning: hadRepair },
    }));
    warnings.push(repair.warning);
  } else if (unsafe) {
    elements.push(
      createImageElement(source.dataUrl, source.width, source.height, {
        x: fit.x,
        y: fit.y,
        width: fit.width,
        height: fit.height,
        radius: 0,
        assetId: source.id,
        name: "배경 보정 필요 · 원본 잔상 가능",
        locked: true,
        provenance: {
          source: source.id,
          method: "unclean-original-background",
          review: true,
          backgroundWarning: true,
        },
      }),
    );
    warnings.push(
      "배경 보정 필요: 원본 배경에 텍스트·객체 잔상이 남아 있습니다. 정확한 분리 결과가 아닙니다.",
    );
  } else if (analysis.background.kind === "gradient")
    background = {
      type: "gradient",
      from: analysis.background.from,
      to: analysis.background.to,
      angle: analysis.background.angle,
    };
  else
    warnings.push(
      "단색 배경 근사 복원: 제외한 영역은 생성하지 않습니다. 원본과 비교해 누락을 확인하세요.",
    );
  for (const r of [...analysis.regions].sort((a, b) => a.zIndex - b.zIndex)) {
    if (skip.includes(r.id)) continue;
    if (unsafe && !repair) { retained.push({id:r.id,type:r.type,reason:"original-preserved"}); continue; }
    const [rx, ry, w, h] = toPixels(r.bbox, fit.width, fit.height);
    const x = fit.x + rx,
      y = fit.y + ry;
    const pixels = toPixels(r.bbox, source.width, source.height);
    const provenance: NonNullable<AnyElement["provenance"]> = {
      source: source.id,
      regionId: r.id,
      method: `${provider}:${r.type === "image" ? (hadRepair ? "local-repaired-crop" : r.maskPng ? "png-mask" : r.polygon ? "polygon-mask" : "approximate-crop") : "native-" + r.type}`,
      sourcePixels: pixels,
      review: r.review || provider !== "manual",
      backgroundWarning: mode === "preserve" && !hadRepair ? false : unsafe,
    };
    let el: AnyElement;
    if (r.type === "text")
      el = createTextElement({
        x,
        y,
        width: w,
        height: h,
        text: r.text ?? "",
        fontSize: ((r.style?.fontSize ?? r.bbox[3] * 0.65) * fit.height) / 1000,
        fontFamily: "Noto Sans KR",
        bold: r.style?.bold ?? false,
        fill: r.style?.color ?? "#172C35",
        align: r.style?.align ?? "left",
        lineHeight: r.style?.lineHeight ?? 1.25,
        letterSpacing: (r.style?.letterSpacing ?? 0) * fit.height / 1000,
      });
    else if (r.type === "shape") {
      el =
        r.shape === "line"
          ? createLineElement({
              x,
              y,
              width: w,
              height: 0,
              stroke: r.style?.color ?? "#172C35",
            })
          : createShapeElement(r.shape === "ellipse" ? "ellipse" : "rect", {
              x,
              y,
              width: w,
              height: h,
              fill: r.style?.color ?? "#32857A",
              cornerRadius:
                r.shape === "rounded-rect" ? Math.min(w, h) * 0.15 : 0,
            });
    } else {
      const crop = await maskedCrop(img, r);
      if(r.polygon) provenance.mask={bbox:r.bbox,polygon:r.polygon};
      else if(r.maskPng) {
        const maskImage=await loadImage(r.maskPng),maskId=uid("asset");
        assets.push({id:maskId,name:`${r.id} · 원본 경계 데이터`,mime:"image/png",
          width:maskImage.naturalWidth,height:maskImage.naturalHeight,dataUrl:r.maskPng,original:false});
        provenance.mask={bbox:r.bbox,assetId:maskId,edgeRefinement:r.edgeRefinement};
      }
      const a: Asset = {
        id: uid("asset"),
        name: `${r.id} · ${r.maskPng ? "PNG 마스크" : r.polygon ? "다각형 마스크" : "근사 크롭"}`,
        mime: "image/png",
        width: crop.width,
        height: crop.height,
        dataUrl: crop.dataUrl,
        original: false,
      };
      assets.push(a);
      provenance.sourcePixels = crop.sourcePixels;
      el = createImageElement(a.dataUrl, a.width, a.height, {
        x: fit.x + crop.sourcePixels[0] * fit.scale,
        y: fit.y + crop.sourcePixels[1] * fit.scale,
        width: crop.width * fit.scale,
        height: crop.height * fit.scale,
        radius: 0,
        assetId: a.id,
      });
    }
    el.name =
      r.type === "text"
        ? `확인 필요 · ${r.text?.slice(0, 20)}`
        : r.type === "image"
          ? r.polygon || r.maskPng
            ? "마스크 이미지 · 경계 확인 필요"
            : "근사 크롭"
          : r.shape;
    el.provenance = provenance;
    elements.push(el);
  }
  const warningCodes = assessInventory(originalAnalysis.regions, options.inputKind ?? "unknown");
  if (mode === "redraw" && !hadRepair && !unsafe) warningCodes.push("GLOBAL_BACKGROUND_LOSS");
  if (lowContrast || (mode === "redraw" && !unsafe && originalAnalysis.regions.some(r=>r.type==="text"&&textContrast(r.style?.color??"#172C35",analysis.background.from)<3))) warningCodes.push("LOW_TEXT_CONTRAST");
  const stages = [...(options.initial?.stages ?? []), snapshotStage("reviewed", originalAnalysis.regions.filter(r=>!skip.includes(r.id)), originalAnalysis.regions.filter(r=>skip.includes(r.id)).map(r=>({id:r.id,type:r.type,reason:"user-excluded" as const}))),
    snapshotStage("reconstructed",elementItems(elements),retained.filter(r=>r.reason!=="user-excluded"))];
  for(let i=1;i<stages.length;i++)for(const id of unexplainedLosses(stages[i-1],stages[i]))warningCodes.push(`UNEXPLAINED_LOSS:${id}`);
  const nativeCount = elements.filter(e=>e.provenance?.regionId).length;
  const diagnostic: Diagnostic = {
    version:1,runId:options.initial?.runId ?? uid("run"),sourceId:source.id,createdAt:new Date().toISOString(),
    provider,build:options.initial?.build,transport:options.initial?.transport,
    inputKind: options.inputKind ?? "unknown",mode:hadRepair?"local-repair":mode,
    status: mode==="preserve"&&!hadRepair ? nativeCount?"partial-editable":"original-preserved" : "review-required",
    background:hadRepair?"inpaint-approximation":mode==="preserve"?localPatchCount?"local-patches":"original":unsafe?"original":"redrawn",
    stages,warnings:warningCodes,
  };
  return { page: { ...createPage(background), elements }, assets, warnings, diagnostic };
}
