import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { type Analysis } from "./magic-layers/schema";
import {
  googleAnalysisSchema,
  googleMaskSchema,
  normalizeGoogleAnalysis,
  mergeGoogleMasks,
} from "./magic-layers/google-analysis";
import { aiPolicy, MODEL_CANDIDATES } from "./ai-policy";
export interface AnalysisProvenance {
  model: string;
  apiMode: string;
  generationCalls: number;
  segmentation: "combined" | "separate" | "failed";
  segmentationError?: string;
}
export interface AiAnalyzer {
  analyze(image: string, mime: string): Promise<Analysis>;
  lastRun?: AnalysisProvenance;
}
export class AnalysisError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
export class DisabledAnalyzer implements AiAnalyzer {
  constructor(
    private reason = "AI 연결 필요: 서버에 GEMINI_API_KEY를 설정하세요.",
  ) {}
  async analyze(): Promise<Analysis> {
    throw new AnalysisError("AI_DISABLED", this.reason, 503);
  }
}
export function diagnostic(error: unknown): AnalysisError {
  if (error instanceof AnalysisError) return error;
  const data =
    typeof error === "object" && error !== null
      ? (error as {
          status?: unknown;
          message?: unknown;
          name?: unknown;
          headers?: Headers;
        })
      : {};
  const status = Number(data.status) || 0,
    name = String(data.name ?? "").toLowerCase();
  if (status === 429) {
    const seconds = Number(data.headers?.get?.("retry-after"));
    return new AnalysisError(
      "QUOTA",
      "Gemini 할당량 초과. 자동 재시도하지 않았습니다. 계정 쿼터와 재시도 시간을 확인하세요.",
      429,
      Number.isFinite(seconds) && seconds > 0 && seconds <= 86400
        ? seconds
        : undefined,
    );
  }
  if (
    status === 400 &&
    /schema|constraint|response.format/i.test(String(data.message ?? ""))
  )
    return new AnalysisError(
      "SCHEMA_UNSUPPORTED",
      "선택 모델/API가 구조화 스키마를 거부했습니다. 자동으로 다른 API를 재호출하지 않았습니다.",
      422,
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
  if (name.includes("timeout") || name === "aborterror")
    return new AnalysisError(
      "TIMEOUT",
      "분석 시간 초과. 서버 요청은 계속 처리될 수 있어 자동 재시도하지 않았습니다. 잠시 후 결과를 확인하세요.",
      504,
    );
  if (error instanceof SyntaxError || error instanceof z.ZodError)
    return new AnalysisError(
      "INVALID_ANALYSIS",
      "분석 JSON 또는 마스크가 유효하지 않습니다. 자동 재호출 없이 프로젝트를 보존했습니다.",
      422,
    );
  return new AnalysisError(
    "NETWORK",
    "분석 연결에 실패했습니다. 자동 재시도하지 않았습니다. 프로젝트는 변경하지 않았습니다.",
    503,
  );
}
/** Compatibility name retained; phase 2 forbids automatic paid/duplicate attempts. */
export async function withRetries<T>(
  run: () => Promise<T>,
  legacyDelay?: unknown,
): Promise<T> {
  void legacyDelay;
  try {
    return await run();
  } catch (e) {
    throw diagnostic(e);
  }
}
export function aiConfig() {
  return aiPolicy();
}
export interface ModelProbe {
  model: string;
  accessible: boolean;
  code?: string;
  supportedActions?: string[];
}
export async function probeModels(
  client: GoogleGenAI,
  candidates: string[] = MODEL_CANDIDATES,
): Promise<ModelProbe[]> {
  const results: ModelProbe[] = [];
  for (const model of candidates) {
    try {
      const meta = await client.models.get({
        model,
        config: { abortSignal: AbortSignal.timeout(8000) },
      });
      results.push({
        model,
        accessible: true,
        supportedActions: meta.supportedActions,
      });
    } catch (e) {
      results.push({ model, accessible: false, code: diagnostic(e).code });
    }
  }
  return results;
}
const LAYOUT_PROMPT = `Analyze only visible Korean/other text, simple shapes and image objects. Return EXACT visible text, including punctuation and line breaks. Never invent unreadable characters; omit unreadable content and describe omissions in notes. Text must be native text, simple rect/ellipse/line native shapes, detailed illustrations images. All box_2d coordinates MUST be [ymin,xmin,ymax,xmax] normalized 0..1000 relative to the whole image. For image contours, mask is polygon [x,y] points normalized within the object's bounding box (mask_space=bbox), or explicitly mark mask_space=image for whole-image points. Do not replace a segmentation contour with a rectangle. Omit uncertain masks. Do not generate a mask_png or synthetic pixels; copy source pixels later. Mark every inferred region review=true; no confidence values. Separate text printed inside an illustration from its underlying image object. style.fontSize is normalized 0..1000 relative to source image height; colors #RRGGBB; align left/center/right. zIndex bottom-to-top; no duplicate regions. Background complex for uncertain/photographic/textured backgrounds; solid/gradient only when evident. Report missing/occluded pixels in notes. Limit to 80 regions and 96 polygon vertices.`;
const MASK_PROMPT = `Return segmentation ONLY for the image region IDs listed below. Preserve IDs. box_2d=[ymin,xmin,ymax,xmax] in whole-image 0..1000. mask is a real object contour polygon [x,y] normalized within its box, with mask_space=bbox. If using whole-image points explicitly return mask_space=image. Do not substitute rectangular crops for contours. Omit masks you cannot infer. Do not invent hidden pixels, text, new objects, IDs or mask_png. Maximum 96 vertices per contour. Requested regions: `;
function jsonSchema(schema: z.ZodType) {
  const value = z.toJSONSchema(schema, { unrepresentable: "any" });
  delete value.$schema;
  return value;
}
function parseJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw new AnalysisError(
      "INVALID_ANALYSIS",
      "Gemini가 올바른 JSON을 반환하지 않았습니다. 자동 재호출하지 않았습니다.",
    );
  }
}
export class GeminiAnalyzer implements AiAnalyzer {
  lastRun?: AnalysisProvenance;
  constructor(
    private options: {
      mode?: "combined" | "separate";
      beforeGenerate?: () => void;
    } = {},
  ) {}
  async analyze(image: string, mime: string): Promise<Analysis> {
    const cfg = aiConfig();
    if (!cfg.enabled) throw new AnalysisError("AI_DISABLED", cfg.reason, 503);
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } },
    });
    const candidates = process.env.GEMINI_VISION_MODEL?.trim()
      ? [cfg.model]
      : MODEL_CANDIDATES;
    let selected: string | undefined;
    for (const model of candidates) {
      const [probe] = await probeModels(client, [model]);
      if (
        probe.accessible &&
        (!probe.supportedActions ||
          probe.supportedActions.some((a) =>
            /generatecontent|interact/i.test(a),
          ))
      ) {
        selected = model;
        break;
      }
    }
    if (!selected)
      throw new AnalysisError(
        "MODEL_UNSUPPORTED",
        "허용된 최신 모델 후보에 접근할 수 없습니다. 연결 검사 결과와 계정 모델 권한을 확인하세요.",
      );
    const model = selected;
    this.lastRun = {
      model,
      apiMode: cfg.apiMode,
      generationCalls: 0,
      segmentation: this.options.mode ?? "combined",
    };
    const request = async (prompt: string, schema: z.ZodType) =>
      withRetries(async () => {
        this.options.beforeGenerate?.();
        this.lastRun!.generationCalls++;
        if (cfg.apiMode === "generate-content") {
          const response = await client.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: mime, data: image.split(",")[1] } },
                  { text: prompt },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseJsonSchema: jsonSchema(schema),
              maxOutputTokens: 16384,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              abortSignal: AbortSignal.timeout(45000),
            },
          });
          return parseJSON(response.text ?? "");
        }
        if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
          throw new AnalysisError(
            "INVALID_IMAGE",
            "지원하지 않는 이미지 형식입니다.",
            400,
          );
        const response = await client.interactions.create(
          {
            model,
            input: [
              { type: "text", text: prompt },
              {
                type: "image",
                data: image.split(",")[1],
                mime_type: mime as "image/png" | "image/jpeg" | "image/webp",
              },
            ],
            store: false,
            stream: false,
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: jsonSchema(schema),
            },
            response_mime_type: "application/json",
            generation_config: {
              thinking_level: "low",
              thinking_summaries: "none",
              max_output_tokens: 16384,
            },
          },
          { maxRetries: 0, timeout: 45000, signal: AbortSignal.timeout(45000) },
        );
        if (response.status !== "completed")
          throw new AnalysisError(
            "INCOMPLETE",
            "Gemini 응답이 완료되지 않았습니다. 자동 재요청하지 않았습니다.",
          );
        // SDK 1.52 exposes outputs; newer API documentation also shows output_text.
        const outputText =
          "output_text" in response && typeof response.output_text === "string"
            ? response.output_text
            : (response.outputs ?? [])
                .filter((o) => o.type === "text")
                .map((o) => (o.type === "text" ? o.text : ""))
                .join("");
        return parseJSON(outputText);
      });
    let analysis: Analysis;
    try {
      analysis = normalizeGoogleAnalysis(
        await request(LAYOUT_PROMPT, googleAnalysisSchema),
      );
    } catch (e) {
      throw diagnostic(e);
    }
    if (
      this.options.mode === "separate" &&
      analysis.regions.some((r) => r.type === "image")
    ) {
      try {
        const targets = analysis.regions
          .filter((r) => r.type === "image")
          .map((r) => ({
            id: r.id,
            box_2d: [
              r.bbox[1],
              r.bbox[0],
              r.bbox[1] + r.bbox[3],
              r.bbox[0] + r.bbox[2],
            ],
          }));
        analysis = mergeGoogleMasks(
          analysis,
          await request(
            MASK_PROMPT + JSON.stringify(targets),
            googleMaskSchema,
          ),
        );
      } catch (e) {
        const error = diagnostic(e);
        this.lastRun.segmentation = "failed";
        this.lastRun.segmentationError = error.code;
        analysis = {
          ...analysis,
          notes: (
            analysis.notes +
            "\n별도 마스크 분석 실패 (" +
            error.code +
            "). 첫 분석은 보존했고, 사각 크롭은 근사 결과입니다. 자동 재시도하지 않았습니다."
          ).slice(0, 2000),
        };
      }
    }
    return analysis;
  }
}
export function analyzer(options?: {
  mode?: "combined" | "separate";
  beforeGenerate?: () => void;
}): AiAnalyzer {
  return aiConfig().enabled
    ? new GeminiAnalyzer(options)
    : new DisabledAnalyzer(aiConfig().reason);
}
