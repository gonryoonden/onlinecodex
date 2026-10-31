import catalog from "./gemini-models.json";
export const MODEL_CANDIDATES = catalog.models.map((m) => m.id);
export function aiPolicy(
  env: Record<string, string | undefined> = process.env,
) {
  const model = env.GEMINI_VISION_MODEL?.trim() || MODEL_CANDIDATES[0];
  const configured = Boolean(env.GEMINI_API_KEY?.trim());
  const allowed = MODEL_CANDIDATES.includes(model);
  // An API key/model metadata cannot prove billing. This is explicit operator
  // confirmation of AI Studio's project tier, never an assertion inferred from a key.
  const freeTierConfirmed = env.GEMINI_BILLING_TIER === "free";
  const paidDisabled = env.ENABLE_PAID_AI !== "true";
  const enabled = configured && allowed && freeTierConfirmed && paidDisabled;
  const reason = !configured
    ? "AI 연결 필요: GEMINI_API_KEY 미설정"
    : !allowed
      ? "공식 무료 티어를 확인한 모델 후보만 허용합니다."
      : !paidDisabled
        ? "이번 실행은 ENABLE_PAID_AI=false만 허용합니다."
        : !freeTierConfirmed
          ? "무료 티어 확인 필요: AI Studio에서 이 키의 프로젝트 Billing Tier를 확인한 뒤 GEMINI_BILLING_TIER=free로 설정하세요."
          : "무료 티어는 운영자 확인 상태입니다. 실제 계정 모델 접근은 분석 전 점검합니다.";
  return {
    enabled,
    model,
    configured,
    reason,
    freeTierConfirmed,
    billingVerification: freeTierConfirmed
      ? "operator-confirmed; not independently verified by API"
      : "unknown",
    paidImageGeneration: false,
    candidates: MODEL_CANDIDATES,
    modelVerified: false,
    apiMode:
      env.GEMINI_API_MODE === "generate-content"
        ? "generate-content"
        : "interactions",
  };
}
