import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({ get: vi.fn(), generate: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { get: mocks.get, generateContent: mocks.generate };
  },
}));
import { GeminiAnalyzer } from "@/lib/ai-analyzer";
const valid = readFileSync(
  "../../tests/studio/fixtures/synthetic.analysis.json",
  "utf8",
);
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-only-placeholder");
  vi.stubEnv("GEMINI_VISION_MODEL", "gemini-2.5-flash");
  mocks.get
    .mockReset()
    .mockResolvedValue({ supportedActions: ["generateContent"] });
  mocks.generate.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it("probes model and validates structured response (test SDK only)", async () => {
  mocks.generate.mockResolvedValue({ text: valid });
  const a = await new GeminiAnalyzer().analyze(
    "data:image/png;base64,AA==",
    "image/png",
  );
  expect(a.regions).toHaveLength(7);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.generate.mock.calls[0][0].config.responseMimeType).toBe(
    "application/json",
  );
  expect(
    mocks.generate.mock.calls[0][0].contents[0].parts[0].inlineData.data,
  ).toBe("AA==");
});
it("does not generate against unavailable model", async () => {
  mocks.get.mockRejectedValue({ status: 404 });
  await expect(
    new GeminiAnalyzer().analyze("image", "image/png"),
  ).rejects.toHaveProperty("code", "MODEL_UNSUPPORTED");
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("rejects malformed model JSON and stops after two retries", async () => {
  mocks.generate.mockResolvedValue({ text: '{"invented":true}' });
  await expect(
    new GeminiAnalyzer().analyze("image", "image/png"),
  ).rejects.toHaveProperty("code", "INVALID_ANALYSIS");
  expect(mocks.generate).toHaveBeenCalledTimes(3);
});
it("quota and timeout get actionable bounded failures", async () => {
  mocks.generate.mockRejectedValue({ status: 429 });
  await expect(
    new GeminiAnalyzer().analyze("image", "image/png"),
  ).rejects.toHaveProperty("code", "QUOTA");
  expect(mocks.generate).toHaveBeenCalledTimes(3);
  mocks.generate
    .mockReset()
    .mockRejectedValue(new DOMException("test timeout", "TimeoutError"));
  await expect(
    new GeminiAnalyzer().analyze("image", "image/png"),
  ).rejects.toHaveProperty("code", "TIMEOUT");
  expect(mocks.generate).toHaveBeenCalledTimes(3);
});
