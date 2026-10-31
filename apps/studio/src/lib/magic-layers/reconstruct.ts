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
export async function maskedCrop(source: HTMLImageElement, region: Region) {
  const [sx, sy, sw, sh] = toPixels(
    region.bbox,
    source.naturalWidth,
    source.naturalHeight,
  );
  // Integer, one-to-one source pixels. Padding leaves transparent room around masks.
  const pad = region.polygon ? 2 : 0;
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
export async function reconstructDesign(
  input: Analysis,
  source: Asset,
  width: number,
  height: number,
  skip: string[],
  confirmedBackground: boolean,
  provider = "manual",
) {
  const analysis = analysisSchema.parse(input);
  const img = await loadImage(source.dataUrl);
  const fit = fitSource(source.width, source.height, width, height);
  const elements: AnyElement[] = [];
  const assets: Asset[] = [];
  const warnings: string[] = [];
  let background: Background = {
    type: "solid",
    color: analysis.background.from,
  };
  const unsafe = analysis.background.kind === "complex" || !confirmedBackground;
  if (unsafe) {
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
    const [rx, ry, w, h] = toPixels(r.bbox, fit.width, fit.height);
    const x = fit.x + rx,
      y = fit.y + ry;
    const pixels = toPixels(r.bbox, source.width, source.height);
    const provenance = {
      source: source.id,
      regionId: r.id,
      method: `${provider}:${r.type === "image" ? (r.polygon ? "polygon-mask" : "approximate-crop") : "native-" + r.type}`,
      sourcePixels: pixels,
      review: r.review || provider !== "manual",
      backgroundWarning: unsafe,
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
      const a: Asset = {
        id: uid("asset"),
        name: `${r.id} · ${r.polygon ? "다각형 마스크" : "근사 크롭"}`,
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
          ? r.polygon
            ? "마스크 이미지 · 경계 확인 필요"
            : "근사 크롭"
          : r.shape;
    el.provenance = provenance;
    elements.push(el);
  }
  return { page: { ...createPage(background), elements }, assets, warnings };
}
