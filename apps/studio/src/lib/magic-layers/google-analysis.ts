import { z } from "zod";
import {
  analysisSchema,
  bboxSchema,
  googleYXBox,
  polygonSchema,
  regionSchema,
  type Analysis,
  type Point,
} from "./schema";
const coord = z.number().finite().min(0).max(1000);
const box = z.array(coord).length(4);
const points = z.array(z.array(coord).length(2)).min(3).max(256);
export const googleRegionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  type: z.enum(["text", "shape", "image"]),
  box_2d: box,
  text: z.string().max(10000).optional(),
  shape: z.enum(["rect", "rounded-rect", "ellipse", "line"]).optional(),
  style: z
    .object({
      color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
      fontSize: coord.positive().optional(),
      bold: z.boolean().optional(),
      align: z.enum(["left", "center", "right"]).optional(),
    })
    .optional(),
  mask: points.optional(),
  mask_space: z.enum(["bbox", "image"]).optional(),
  mask_png: z.string().optional(),
  zIndex: z.number().int().min(-100).max(1000),
  review: z.boolean(),
});
export const googleAnalysisSchema = z.object({
  background: analysisSchema.shape.background,
  regions: z.array(googleRegionSchema).min(1).max(80),
  notes: z.string().max(2000),
});
export const googleMaskSchema = z.object({
  masks: z
    .array(
      z.object({
        id: z.string(),
        box_2d: box,
        mask: points.optional(),
        mask_space: z.enum(["bbox", "image"]).optional(),
        mask_png: z.string().optional(),
      }),
    )
    .max(80),
});
export function googlePolygon(
  yx: number[],
  polygon: number[][],
  space: "bbox" | "image",
): Point[] {
  const [x, y, w, h] = googleYXBox(yx as [number, number, number, number]);
  return polygonSchema.parse(
    polygon.map(([px, py]) =>
      space === "bbox" ? [x + (px * w) / 1000, y + (py * h) / 1000] : [px, py],
    ),
  );
}
function maskFields(region: {
  box_2d: number[];
  mask?: number[][];
  mask_space?: "bbox" | "image";
  mask_png?: string;
}) {
  if (region.mask && region.mask_png)
    throw new Error("동시에 polygon과 PNG mask를 사용할 수 없습니다.");
  if (region.mask && !region.mask_space)
    throw new Error("다각형 mask 좌표 공간이 누락되었습니다.");
  return {
    polygon: region.mask
      ? googlePolygon(region.box_2d, region.mask, region.mask_space!)
      : undefined,
    maskPng: region.mask_png,
  };
}
export function normalizeGoogleAnalysis(raw: unknown): Analysis {
  const data = googleAnalysisSchema.parse(raw);
  return analysisSchema.parse({
    ...data,
    regions: data.regions.map((r) => ({
      id: r.id,
      type: r.type,
      text: r.text,
      shape: r.shape,
      style: r.style,
      bbox: googleYXBox(r.box_2d as [number, number, number, number]),
      ...maskFields(r),
      zIndex: r.zIndex,
      review: true,
    })),
  });
}
export function mergeGoogleMasks(analysis: Analysis, raw: unknown): Analysis {
  const masks = googleMaskSchema.parse(raw).masks;
  const ids = new Set<string>();
  for (const m of masks) {
    if (
      ids.has(m.id) ||
      !analysis.regions.some((r) => r.id === m.id && r.type === "image")
    )
      throw new Error("알 수 없거나 중복된 mask ID");
    ids.add(m.id);
  }
  return analysisSchema.parse({
    ...analysis,
    regions: analysis.regions.map((r) => {
      const m = masks.find((m) => m.id === r.id);
      return m
        ? regionSchema.parse({
            ...r,
            bbox: bboxSchema.parse(
              googleYXBox(m.box_2d as [number, number, number, number]),
            ),
            ...maskFields(m),
          })
        : r;
    }),
  });
}
