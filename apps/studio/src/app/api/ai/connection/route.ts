import { GoogleGenAI } from "@google/genai";
import { aiConfig, probeModels } from "@/lib/ai-analyzer";
import { guard } from "@/lib/server-guard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const policy = aiConfig();
  if (!policy.configured)
    return Response.json(
      {
        keyPresent: false,
        models: [],
        generationCalls: 0,
        billing: "unknown",
        reason: policy.reason,
      },
      { status: 503 },
    );
  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 8000, retryOptions: { attempts: 1 } },
  });
  const models = await probeModels(client);
  return Response.json({
    keyPresent: true,
    models,
    proposedModel: models.find((m) => m.accessible)?.model ?? null,
    generationCalls: 0,
    billing: policy.billingVerification,
    reason: policy.reason,
    note: "모델 메타데이터 접근만 검사했습니다. 생성 성공·무료 과금 상태를 보장하지 않습니다.",
  });
}
