import { it, expect } from "vitest";
import { aiPolicy, MODEL_CANDIDATES } from "@/lib/ai-policy";
import {
  googlePolygon,
  normalizeGoogleAnalysis,
  mergeGoogleMasks,
} from "@/lib/magic-layers/google-analysis";
import { toPixels } from "@/lib/magic-layers/schema";
const wire = {
  background: { kind: "complex", from: "#FFFFFF", to: "#FFFFFF", angle: 0 },
  notes: "Test-only wire fixture",
  regions: [
    {
      id: "object",
      type: "image",
      box_2d: [100, 200, 500, 800],
      mask: [
        [500, 0],
        [1000, 500],
        [500, 1000],
        [0, 500],
      ],
      mask_space: "bbox",
      zIndex: 0,
      review: false,
    },
  ],
};
it("converts Google YX corners and box-local polygon on a non-square image", () => {
  const region = normalizeGoogleAnalysis(wire).regions[0];
  expect(region.bbox).toEqual([200, 100, 600, 400]);
  expect(region.polygon).toEqual([
    [500, 100],
    [800, 300],
    [500, 500],
    [200, 300],
  ]);
  expect(toPixels(region.bbox, 2000, 1000)).toEqual([400, 100, 1200, 400]);
  expect(region.review).toBe(true);
});
it("accepts explicitly whole-image polygon coordinates without a second scaling", () => {
  expect(
    googlePolygon(
      [100, 200, 500, 800],
      [
        [500, 100],
        [800, 300],
        [500, 500],
        [200, 300],
      ],
      "image",
    ),
  ).toEqual([
    [500, 100],
    [800, 300],
    [500, 500],
    [200, 300],
  ]);
});
it("rejects ambiguous mask coordinates rather than guessing", () => {
  expect(() =>
    normalizeGoogleAnalysis({
      ...wire,
      regions: [{ ...wire.regions[0], mask_space: undefined }],
    }),
  ).toThrow("좌표 공간");
});
it("rejects masks assigned to unknown regions", () => {
  const analysis = normalizeGoogleAnalysis(wire);
  expect(() =>
    mergeGoogleMasks(analysis, {
      masks: [{ id: "unknown", box_2d: [100, 200, 500, 800] }],
    }),
  ).toThrow();
});
it("rejects inverted Google boxes and invalid PNG signature", () => {
  expect(() =>
    normalizeGoogleAnalysis({
      ...wire,
      regions: [{ ...wire.regions[0], box_2d: [500, 800, 100, 200] }],
    }),
  ).toThrow();
  expect(() =>
    normalizeGoogleAnalysis({
      ...wire,
      regions: [
        {
          ...wire.regions[0],
          mask: undefined,
          mask_png: "data:image/png;base64,AA==",
        },
      ],
    }),
  ).toThrow();
});
it("keeps billing unknown and unverified even when a key is present", () => {
  expect(aiPolicy({ GEMINI_API_KEY: "test-only-placeholder" })).toMatchObject({
    enabled: false,
    billingVerification: "unknown",
    modelVerified: false,
  });
});
it("prioritizes documented candidates and refuses paid override", () => {
  expect(MODEL_CANDIDATES).toEqual([
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
  ]);
  expect(
    aiPolicy({
      GEMINI_API_KEY: "test-only-placeholder",
      GEMINI_BILLING_TIER: "free",
      ENABLE_PAID_AI: "true",
    }).enabled,
  ).toBe(false);
});
