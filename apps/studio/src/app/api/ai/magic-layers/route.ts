import { z } from "zod";
import sharp from "sharp";
import {
  analyzer,
  AnalysisError,
  diagnostic,
  aiConfig,
} from "@/lib/ai-analyzer";
import { imageData } from "@/lib/project";
import { guard, boundedJson } from "@/lib/server-guard";
export const runtime = "nodejs";
export const maxDuration = 150;
let busy = false,
  day = "",
  calls = 0,
  last = 0;
export async function POST(req: Request) {
  const reject = guard(req);
  if (reject) return reject;
  if (!aiConfig().enabled)
    return Response.json(
      { code: "AI_DISABLED", error: aiConfig().reason },
      { status: 503 },
    );
  if (busy)
    return Response.json(
      { code: "BUSY", error: "이미 분석 중입니다. 완료 후 재시도하세요." },
      { status: 429 },
    );
  const today = new Date().toISOString().slice(0, 10);
  if (day !== today) {
    day = today;
    calls = 0;
  }
  const limit = Math.max(
    1,
    Math.min(100, Number(process.env.AI_DAILY_LIMIT) || 20),
  );
  if (calls >= limit || Date.now() - last < 3000)
    return Response.json(
      {
        code: "QUOTA",
        error: "개인용 호출 한도 초과. 일일 한도와 재시도 간격을 확인하세요.",
      },
      { status: 429 },
    );
  busy = true;
  try {
    const body = z
      .object({
        image: imageData,
        consent: z.literal(true),
        mode: z.enum(["combined", "separate"]).default("combined"),
      })
      .parse(await boundedJson(req, 9 * 1024 * 1024));
    const bytes = Buffer.from(body.image.split(",")[1], "base64");
    const meta = await sharp(bytes, {
      limitInputPixels: 16_000_000,
    }).metadata();
    if (
      !["png", "jpeg", "webp"].includes(meta.format ?? "") ||
      !meta.width ||
      !meta.height ||
      meta.width * meta.height > 16_000_000 ||
      !body.image.startsWith(`data:image/${meta.format};`)
    )
      throw new AnalysisError(
        "INVALID_IMAGE",
        "16MP 이하 PNG/JPEG/WebP 이미지를 사용하세요.",
        400,
      );
    const planned = body.mode === "separate" ? 2 : 1;
    if (calls + planned > limit)
      throw new AnalysisError(
        "QUOTA",
        "선택한 분석 방식에 필요한 일일 호출량이 남아 있지 않습니다.",
        429,
      );
    const engine = analyzer({
      mode: body.mode,
      beforeGenerate: () => {
        if (calls >= limit)
          throw new AnalysisError("QUOTA", "일일 호출 한도 초과", 429);
        calls++;
        last = Date.now();
      },
    });
    const result = await engine.analyze(body.image, `image/${meta.format}`);
    return Response.json({
      analysis: result,
      provenance: {
        provider: "gemini",
        model: engine.lastRun?.model ?? aiConfig().model,
        apiMode: engine.lastRun?.apiMode,
        generationCalls: engine.lastRun?.generationCalls ?? 0,
        segmentation: engine.lastRun?.segmentation,
        segmentationError: engine.lastRun?.segmentationError,
        analyzedAt: new Date().toISOString(),
        sourceWidth: meta.width,
        sourceHeight: meta.height,
        coordinates: "xywh-0..1000",
        confidence: "not calibrated; omitted",
      },
      usage: { requests: calls, dailyLimit: limit },
    });
  } catch (error) {
    const e =
      error instanceof z.ZodError
        ? new AnalysisError(
            "INVALID_INPUT",
            "명시적 외부 전송 동의와 유효한 이미지가 필요합니다.",
            400,
          )
        : diagnostic(error);
    return Response.json(
      {
        code: e.code,
        error: e.message,
        retryAfterSeconds: e.retryAfterSeconds,
        autoRetried: false,
      },
      { status: e.status },
    );
  } finally {
    busy = false;
  }
}
