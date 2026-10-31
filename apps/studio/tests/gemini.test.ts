import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  generate: vi.fn(),
  interact: vi.fn(),
}));
vi.mock("@google/genai", () => ({
  ThinkingLevel: { LOW: "LOW" },
  GoogleGenAI: class {
    models = { get: mocks.get, generateContent: mocks.generate };
    interactions = { create: mocks.interact };
  },
}));
import { GeminiAnalyzer } from "@/lib/ai-analyzer";
const sourceFixture = JSON.parse(
  readFileSync("../../tests/studio/fixtures/synthetic.analysis.json", "utf8"),
);
// Test-only conversion to Google wire format; never a live Gemini result.
const wire = {
  ...sourceFixture,
  regions: sourceFixture.regions.map(
    (r: { bbox: number[]; polygon?: number[][] }) => ({
      ...r,
      box_2d: [
        r.bbox[1],
        r.bbox[0],
        r.bbox[1] + r.bbox[3],
        r.bbox[0] + r.bbox[2],
      ],
      mask: r.polygon,
      mask_space: r.polygon ? "image" : undefined,
    }),
  ),
};
const valid = JSON.stringify(wire);
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-only-placeholder");
  vi.stubEnv("GEMINI_VISION_MODEL", "gemini-3.8-flash");
  vi.stubEnv("GEMINI_BILLING_TIER", "free");
  vi.stubEnv("ENABLE_PAID_AI", "false");
  vi.stubEnv("GEMINI_API_MODE", "generate-content");
  mocks.interact.mockReset();
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
it("rejects malformed model JSON without automatic retry", async () => {
  mocks.generate.mockResolvedValue({ text: '{"invented":true}' });
  await expect(
    new GeminiAnalyzer().analyze("image", "image/png"),
  ).rejects.toHaveProperty("code", "INVALID_ANALYSIS");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});
it("quota and timeout get actionable bounded failures", async () => {
  mocks.generate.mockRejectedValue({ status: 429 });
  await expect(
    new GeminiAnalyzer().analyze("image", "image/png"),
  ).rejects.toHaveProperty("code", "QUOTA");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  mocks.generate
    .mockReset()
    .mockRejectedValue(new DOMException("test timeout", "TimeoutError"));
  await expect(
    new GeminiAnalyzer().analyze("image", "image/png"),
  ).rejects.toHaveProperty("code", "TIMEOUT");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});

it("requires explicit free-project confirmation before any SDK call", async () => {
  vi.stubEnv("GEMINI_BILLING_TIER", "");
  await expect(
    new GeminiAnalyzer().analyze("image", "image/png"),
  ).rejects.toHaveProperty("code", "AI_DISABLED");
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("Interactions disables SDK retries and storage, and uses supported low thinking", async () => {
  vi.stubEnv("GEMINI_API_MODE", "interactions");
  mocks.interact.mockResolvedValue({
    status: "completed",
    outputs: [{ type: "text", text: valid }],
  });
  const analyzer = new GeminiAnalyzer();
  expect(
    (await analyzer.analyze("data:image/png;base64,AA==", "image/png")).regions,
  ).toHaveLength(7);
  const [params, options] = mocks.interact.mock.calls[0];
  expect(params).toMatchObject({
    model: "gemini-3.8-flash",
    store: false,
    generation_config: { thinking_level: "low" },
  });
  expect(params.generation_config).not.toHaveProperty("temperature");
  expect(options.maxRetries).toBe(0);
  expect(analyzer.lastRun?.generationCalls).toBe(1);
});
it("a separate mask failure preserves the first analysis without retry", async () => {
  mocks.generate
    .mockResolvedValueOnce({ text: valid })
    .mockRejectedValueOnce({ status: 429 });
  const analyzer = new GeminiAnalyzer({ mode: "separate" });
  const analysis = await analyzer.analyze(
    "data:image/png;base64,AA==",
    "image/png",
  );
  expect(analysis.regions).toHaveLength(7);
  expect(analysis.notes).toContain("QUOTA");
  expect(analyzer.lastRun).toMatchObject({
    segmentation: "failed",
    generationCalls: 2,
  });
  expect(mocks.generate).toHaveBeenCalledTimes(2);
});
it("separate mask response updates only matching image regions", async () => {
  const target = wire.regions.find((r: { type: string }) => r.type === "image");
  mocks.generate.mockResolvedValueOnce({ text: valid }).mockResolvedValueOnce({
    text: JSON.stringify({
      masks: [
        {
          id: target.id,
          box_2d: target.box_2d,
          mask: [
            [500, 0],
            [1000, 500],
            [500, 1000],
            [0, 500],
          ],
          mask_space: "bbox",
        },
      ],
    }),
  });
  const analyzer = new GeminiAnalyzer({ mode: "separate" });
  const analysis = await analyzer.analyze(
    "data:image/png;base64,AA==",
    "image/png",
  );
  expect(
    analysis.regions.find((r) => r.id === target.id)?.polygon,
  ).toHaveLength(4);
  expect(
    analysis.regions.filter((r) => r.type === "text").map((r) => r.text),
  ).toEqual(
    sourceFixture.regions
      .filter((r: { type: string }) => r.type === "text")
      .map((r: { text: string }) => r.text),
  );
  expect(analyzer.lastRun).toMatchObject({
    segmentation: "separate",
    generationCalls: 2,
  });
});
