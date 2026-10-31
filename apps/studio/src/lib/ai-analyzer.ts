import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  analysisSchema,
  parseAnalysis,
  type Analysis,
} from "./magic-layers/schema";
export interface AiAnalyzer {
  analyze(image: string, mime: string): Promise<Analysis>;
}
export class DisabledAnalyzer implements AiAnalyzer {
  async analyze(): Promise<Analysis> {
    throw new AnalysisError(
      "AI_DISABLED",
      "AI 연결 필요: 서버에 GEMINI_API_KEY를 설정하세요.",
      503,
    );
  }
}
export class AnalysisError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
export function diagnostic(error: unknown): AnalysisError {
  if (error instanceof AnalysisError) return error;
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number(error.status)
      : 0;
  const name = error instanceof Error ? error.name : "";
  if (status === 429)
    return new AnalysisError(
      "QUOTA",
      "Gemini 할당량을 초과했습니다. 잠시 후 재시도하거나 계정 쿼터를 확인하세요.",
      429,
    );
  if (status === 404 || status === 400)
    return new AnalysisError(
      "MODEL_UNSUPPORTED",
      "모델이 없거나 요청을 지원하지 않습니다. GEMINI_VISION_MODEL과 계정 가용성을 확인하세요.",
      422,
    );
  if (status === 401 || status === 403)
    return new AnalysisError(
      "AUTH",
      "Gemini 키 또는 모델 접근 권한을 확인하세요.",
      403,
    );
  if (name === "AbortError" || name === "TimeoutError")
    return new AnalysisError(
      "TIMEOUT",
      "분석 시간이 초과되었습니다. 작은 이미지로 재시도하세요.",
      504,
    );
  return new AnalysisError(
    "INVALID_ANALYSIS",
    "분석에 실패했습니다. 응답 형식 또는 연결을 확인하세요. 프로젝트는 변경하지 않았습니다.",
    422,
  );
}
export async function withRetries<T>(
  run: () => Promise<T>,
  delay = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await run();
    } catch (error) {
      const e = diagnostic(error);
      if (
        attempt === 2 ||
        !["QUOTA", "TIMEOUT", "INVALID_ANALYSIS"].includes(e.code)
      )
        throw e;
      await delay(250 * 2 ** attempt);
    }
  }
  throw new Error("unreachable");
}
const MODEL_DEFAULT = "gemini-2.5-flash";
export function aiConfig() {
  const model = process.env.GEMINI_VISION_MODEL || MODEL_DEFAULT;
  const key = Boolean(process.env.GEMINI_API_KEY);
  const allowed =
    /^gemini-[\w.-]+$/.test(model) &&
    !/(image|tts|live|audio|embedding)/i.test(model);
  return {
    enabled: key && allowed,
    model,
    configured: key,
    reason: !key
      ? "AI 연결 필요: GEMINI_API_KEY 미설정"
      : !allowed
        ? "이미지 생성·음성 모델은 분석에 사용할 수 없습니다."
        : "계정의 모델 가용성은 분석 시 확인합니다.",
    paidImageGeneration: false,
  };
}
export class GeminiAnalyzer implements AiAnalyzer {
  async analyze(image: string, mime: string) {
    const cfg = aiConfig();
    if (!cfg.enabled) throw new AnalysisError("MODEL_UNSUPPORTED", cfg.reason);
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: 18000, retryOptions: { attempts: 1 } },
    });
    try {
      const model = await client.models.get({
        model: cfg.model,
        config: { abortSignal: AbortSignal.timeout(10000) },
      });
      if (
        model.supportedActions &&
        !model.supportedActions.some((a) =>
          a.toLowerCase().includes("generatecontent"),
        )
      )
        throw new AnalysisError(
          "MODEL_UNSUPPORTED",
          "선택 모델은 generateContent를 지원하지 않습니다.",
        );
    } catch (e) {
      throw diagnostic(e);
    }
    const schema = z.toJSONSchema(analysisSchema, { unrepresentable: "any" });
    delete schema.$schema;
    return withRetries(async () => {
      const response = await client.models.generateContent({
        model: cfg.model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: mime, data: image.split(",")[1] } },
              {
                text: "Read only the visible Korean/other text and objects. Return editable text, simple native shapes and image regions. Do not invent unreadable characters; omit unreadable text and describe in notes. Coordinates MUST be [x,y,width,height], x horizontal/y vertical, normalized 0..1000, not Google [ymin,xmin,ymax,xmax]. Polygon points are [x,y] in whole-image 0..1000, must stay within bbox, no self-intersections. Omit polygon if uncertain; never claim a bounding box is segmentation. Do not supply confidence. Mark review=true for all inferred text/regions. style.fontSize is 0..1000 relative to image height. zIndex bottom to top. Background kind complex if any photo/texture or uncertainty; simple solid/gradient only when clear. from/to #RRGGBB always, angle 0..360. Never invent hidden pixels or text.",
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          abortSignal: AbortSignal.timeout(18000),
          temperature: 0,
        },
      });
      return parseAnalysis(response.text ?? "");
    });
  }
}
export function analyzer(): AiAnalyzer {
  return aiConfig().enabled ? new GeminiAnalyzer() : new DisabledAnalyzer();
}
