import { z } from "zod";
import { color } from "../project";
const n = z.number().finite().min(0).max(1000);
export const bboxSchema = z
  .tuple([n, n, n.positive(), n.positive()])
  .refine(
    ([x, y, w, h]) => x + w <= 1000 && y + h <= 1000,
    "영역이 이미지 밖에 있습니다.",
  );
export type Point = [number, number];
function cross(a: Point, b: Point, c: Point) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
export function validPolygon(p: Point[]) {
  let area = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    if (a[0] === b[0] && a[1] === b[1]) return false;
    area += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 2; j < p.length; j++) {
      if (i === 0 && j === p.length - 1) continue;
      const c = p[j],
        d = p[(j + 1) % p.length];
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0
      )
        return false;
    }
  }
  return Math.abs(area) > 1;
}
export const polygonSchema = z
  .array(z.tuple([n, n]))
  .min(3)
  .max(256)
  .refine(validPolygon, "다각형이 비어 있거나 자체 교차합니다.");
export const regionSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    type: z.enum(["text", "shape", "image"]),
    text: z.string().max(10000).optional(),
    bbox: bboxSchema,
    polygon: polygonSchema.optional(),
    maskPng: z
      .string()
      .max(2 * 1024 * 1024)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/)
      .optional(),
    shape: z.enum(["rect", "rounded-rect", "ellipse", "line"]).optional(),
    style: z
      .object({
        color: color,
        fontSize: z.number().finite().positive().max(1000).optional(),
        bold: z.boolean().optional(),
        align: z.enum(["left", "center", "right"]).optional(),
      })
      .optional(),
    zIndex: z.number().int().min(-100).max(1000),
    review: z.boolean(),
    sourcePixels: z
      .tuple([z.number(), z.number(), z.number(), z.number()])
      .optional(),
  })
  .superRefine((r, ctx) => {
    if (r.polygon && r.maskPng)
      ctx.addIssue({
        code: "custom",
        message: "polygon과 PNG mask는 동시에 사용할 수 없습니다.",
      });
    if (r.maskPng && !r.maskPng.startsWith("data:image/png;base64,iVBORw0KGgo"))
      ctx.addIssue({
        code: "custom",
        message: "PNG mask의 파일 서명이 유효하지 않습니다.",
      });
    if (r.type === "text" && !r.text?.trim())
      ctx.addIssue({
        code: "custom",
        message: "판독할 수 없는 빈 텍스트는 생성하지 않습니다.",
      });
    if (r.type === "shape" && !r.shape)
      ctx.addIssue({ code: "custom", message: "도형 종류 누락" });
    if (
      r.polygon &&
      r.polygon.some(
        ([x, y]) =>
          x < r.bbox[0] ||
          y < r.bbox[1] ||
          x > r.bbox[0] + r.bbox[2] ||
          y > r.bbox[1] + r.bbox[3],
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "마스크가 선택 영역 밖에 있습니다.",
      });
  });
export const analysisSchema = z
  .object({
    background: z.object({
      kind: z.enum(["solid", "gradient", "complex"]),
      from: color,
      to: color,
      angle: z.number().finite().min(0).max(360),
    }),
    regions: z.array(regionSchema).min(1).max(80),
    notes: z.string().max(2000),
  })
  .superRefine((a, ctx) => {
    if (new Set(a.regions.map((r) => r.id)).size !== a.regions.length)
      ctx.addIssue({ code: "custom", message: "중복 영역 ID" });
  });
export type Region = z.infer<typeof regionSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export function toPixels(
  box: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  return [
    (box[0] * width) / 1000,
    (box[1] * height) / 1000,
    (box[2] * width) / 1000,
    (box[3] * height) / 1000,
  ];
}
export function googleYXBox(
  box: [number, number, number, number],
): [number, number, number, number] {
  const [y1, x1, y2, x2] = box;
  return bboxSchema.parse([x1, y1, x2 - x1, y2 - y1]);
}
export function parseAnalysis(raw: string): Analysis {
  try {
    return analysisSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error(
      "INVALID_ANALYSIS: 분석 JSON 또는 영역/마스크가 유효하지 않습니다. 프로젝트는 변경하지 않았습니다.",
    );
  }
}
