import { z } from "zod";
import { createPage, uid, type DesignRecord, type AnyElement } from "./types";
const finite = z.number().finite();
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const imageData = z
  .string()
  .max(24 * 1024 * 1024)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/);
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const base = z.object({
  id,
  x: finite.min(-20000).max(20000),
  y: finite.min(-20000).max(20000),
  width: finite.min(0).max(10000),
  height: finite.min(0).max(10000),
  rotation: finite.min(-36000).max(36000),
  opacity: finite.min(0).max(1),
  locked: z.boolean(),
  visible: z.boolean(),
  name: z.string().max(200).optional(),
  assetId: id.optional(),
  shadow: z.object({
    enabled: z.boolean(),
    color: z.string().max(30),
    blur: finite.min(0).max(100),
    offsetX: finite,
    offsetY: finite,
  }),
  provenance: z
    .object({
      source: z.string().max(200),
      regionId: id.optional(),
      method: z.string().max(80),
      sourcePixels: z.tuple([finite, finite, finite, finite]).optional(),
      review: z.boolean(),
      backgroundWarning: z.boolean().optional(),
    })
    .optional(),
});
const text = base.extend({
  type: z.literal("text"),
  text: z.string().max(20000),
  fontSize: finite.min(1).max(1000),
  fontFamily: z.string().min(1).max(100),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  strike: z.boolean(),
  uppercase: z.boolean(),
  fill: color,
  align: z.enum(["left", "center", "right"]),
  lineHeight: finite.min(0.5).max(5),
  letterSpacing: finite.min(-100).max(100),
});
const shape = base.extend({
  type: z.enum(["rect", "ellipse"]),
  fill: color,
  stroke: z.union([color, z.literal("transparent")]),
  strokeWidth: finite.min(0).max(100),
  cornerRadius: finite.min(0).max(5000),
});
const line = base.extend({
  type: z.literal("line"),
  stroke: color,
  strokeWidth: finite.min(0).max(100),
  dashed: z.boolean(),
  arrowStart: z.boolean(),
  arrowEnd: z.boolean(),
});
const image = base.extend({
  type: z.literal("image"),
  src: imageData,
  radius: finite.min(0).max(1000),
  naturalWidth: finite.positive().max(12000),
  naturalHeight: finite.positive().max(12000),
});
export const elementSchema = z.union([text, shape, line, image]);
export const backgroundSchema = z.union([
  z.object({ type: z.literal("solid"), color }),
  z.object({
    type: z.literal("gradient"),
    from: color,
    to: color,
    angle: finite.min(-360).max(360),
  }),
]);
export const assetSchema = z.object({
  id,
  name: z.string().max(250),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().positive().max(12000),
  height: z.number().int().positive().max(12000),
  dataUrl: imageData,
  original: z.boolean(),
});
export type Asset = z.infer<typeof assetSchema>;
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    name: z.string().min(1).max(120),
    width: z.number().int().min(32).max(8000),
    height: z.number().int().min(32).max(8000),
    pages: z
      .array(
        z.object({
          id,
          background: backgroundSchema,
          elements: z.array(elementSchema).max(500),
        }),
      )
      .min(1)
      .max(30),
    assets: z.record(id, assetSchema),
    sources: z.record(id, id),
    createdAt: z.string(),
    updatedAt: z.string(),
    thumbnail: z.string().nullable(),
    source: z.literal("studio"),
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const page of p.pages) {
      if (ids.has(page.id))
        ctx.addIssue({ code: "custom", message: "중복 페이지 ID" });
      ids.add(page.id);
      const eids = new Set();
      for (const el of page.elements) {
        if (eids.has(el.id))
          ctx.addIssue({ code: "custom", message: "중복 레이어 ID" });
        eids.add(el.id);
        if (el.assetId && !p.assets[el.assetId])
          ctx.addIssue({
            code: "custom",
            message: `누락된 에셋: ${el.assetId}`,
          });
        if (
          el.type === "image" &&
          el.assetId &&
          p.assets[el.assetId]?.dataUrl !== el.src
        )
          ctx.addIssue({ code: "custom", message: "이미지 에셋 참조 불일치" });
      }
    }
    for (const [key, a] of Object.entries(p.assets)) {
      if (
        key !== a.id ||
        a.width * a.height > 40_000_000 ||
        !a.dataUrl.startsWith(`data:${a.mime};`)
      )
        ctx.addIssue({ code: "custom", message: "에셋 정보 불일치" });
    }
    for (const [pid, aid] of Object.entries(p.sources)) {
      if (!p.pages.some((page) => page.id === pid) || !p.assets[aid])
        ctx.addIssue({ code: "custom", message: "원본 에셋 참조 누락" });
    }
  });
export interface Project extends DesignRecord {
  schemaVersion: 1;
  assets: Record<string, Asset>;
  sources: Record<string, string>;
  source: "studio";
}
export function validateProject(value: unknown): Project {
  return projectSchema.parse(value) as Project;
}
export function newProject(
  name = "새 디자인",
  width = 960,
  height = 640,
): Project {
  const at = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: uid("project"),
    name,
    width,
    height,
    pages: [createPage()],
    assets: {},
    sources: {},
    source: "studio",
    thumbnail: null,
    createdAt: at,
    updatedAt: at,
  };
}
export function supported(el: AnyElement) {
  return ["text", "rect", "ellipse", "line", "image"].includes(el.type);
}
