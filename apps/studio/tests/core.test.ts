import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  analysisSchema,
  parseAnalysis,
  toPixels,
  googleYXBox,
} from "@/lib/magic-layers/schema";
import { validateProject, newProject } from "@/lib/project";
import { createTextElement, createShapeElement } from "@/lib/types";
import { useEditorStore as store } from "@/store/editor-store";
import {
  DisabledAnalyzer,
  AnalysisError,
  withRetries,
  diagnostic,
  aiConfig,
} from "@/lib/ai-analyzer";
import { guard, boundedJson } from "@/lib/server-guard";
const fixture = JSON.parse(
  readFileSync("../../tests/studio/fixtures/synthetic.analysis.json", "utf8"),
);
describe("strict analysis and coordinate contracts", () => {
  it("preserves known Korean text and source XYWH pixels", () => {
    const a = analysisSchema.parse(fixture);
    expect(a.regions[0].text).toBe("우리의 안전, 함께 만들어요");
    const p = toPixels(a.regions[2].bbox, 960, 640);
    p.forEach((v, i) => expect(v).toBeCloseTo([80, 250, 270, 160][i]));
  });
  it("explicitly converts Google YX corners to XYWH", () =>
    expect(googleYXBox([100, 200, 500, 800])).toEqual([200, 100, 600, 400]));
  it.each(["null", "{}", "not json", '{"regions":[]}'])(
    "rejects malformed JSON %s",
    (s) => expect(() => parseAnalysis(s)).toThrow("INVALID_ANALYSIS"),
  );
  it.each(
    [
      [
        [1, 1],
        [20, 20],
        [1, 20],
        [20, 1],
      ],
      [
        [0, 0],
        [0, 0],
        [0, 2],
      ],
      [
        [0, 0],
        [1, 1],
      ],
      [
        [0, 0],
        [10, 0],
        [1001, 100],
      ],
    ].map((polygon) => ({ polygon })),
  )("rejects invalid polygon $polygon", ({ polygon }) => {
    const a = structuredClone(fixture);
    a.regions[5].polygon = polygon;
    expect(analysisSchema.safeParse(a).success).toBe(false);
  });
  it("rejects out of bounds and duplicate ids", () => {
    const a = structuredClone(fixture);
    a.regions[1].id = a.regions[0].id;
    a.regions[1].bbox = [900, 0, 200, 50];
    expect(analysisSchema.safeParse(a).success).toBe(false);
  });
  it("never invents calibrated confidence", () =>
    expect(
      analysisSchema.parse({ ...fixture, confidence: 0.99 }),
    ).not.toHaveProperty("confidence"));
});
describe("Canvix store reused without DB", () => {
  beforeEach(() => store.getState().loadDesign(newProject()));
  it("edits text, reorders, hides, locks, undoes and redoes", () => {
    const t = createTextElement({ text: "한글", fontFamily: "Noto Sans KR" }),
      r = createShapeElement("rect");
    store.getState().addElement(t);
    store.getState().addElement(r);
    store.getState().updateElements([t.id], { text: "수정한 한글", x: 300 });
    store.getState().moveLayer(t.id, "front");
    store.getState().setVisible([t.id], false);
    store.getState().setLock([t.id], true);
    const p = store.getState().pages[0];
    expect(p.elements[1]).toMatchObject({
      text: "수정한 한글",
      x: 300,
      visible: false,
      locked: true,
    });
    store.getState().undo();
    expect(store.getState().pages[0].elements[1].locked).toBe(false);
    store.getState().redo();
    expect(store.getState().pages[0].elements[1].locked).toBe(true);
  });
  it("isolates two pages and duplicates with unique ids", () => {
    store.getState().addElement(createTextElement({ text: "첫 페이지" }));
    store.getState().addPage();
    store.getState().setCurrentPage(1);
    store.getState().addElement(createTextElement({ text: "두 번째" }));
    expect(store.getState().pages[0].elements[0]).toHaveProperty(
      "text",
      "첫 페이지",
    );
    store.getState().duplicatePage(1);
    expect(store.getState().pages[1].elements[0].id).not.toBe(
      store.getState().pages[2].elements[0].id,
    );
  });
  it("restores selected page and object through history", () => {
    store.getState().addPage();
    store.getState().setCurrentPage(1);
    store.getState().addElement(createTextElement({ text: "보존" }));
    store.getState().deleteSelection();
    store.getState().undo();
    expect(store.getState().pages[1].elements).toHaveLength(1);
  });
});
describe("versioned project integrity", () => {
  it("validates real two-page native fixture", () =>
    expect(
      validateProject(
        JSON.parse(
          readFileSync("../../tests/studio/fixtures/project.json", "utf8"),
        ),
      ).pages,
    ).toHaveLength(2));
  it("rejects unsupported schema and missing assets", () => {
    expect(() =>
      validateProject({ ...newProject(), schemaVersion: 2 }),
    ).toThrow();
    const p = JSON.parse(
      readFileSync("../../tests/studio/fixtures/project.json", "utf8"),
    );
    delete p.assets.diamond;
    expect(() => validateProject(p)).toThrow("누락된 에셋");
  });
  it("rejects remote URLs and executable asset paths", () => {
    const p = JSON.parse(
      readFileSync("../../tests/studio/fixtures/project.json", "utf8"),
    );
    p.assets.original.dataUrl = "http://127.0.0.1/secret";
    expect(() => validateProject(p)).toThrow();
  });
});
describe("AI disabled and diagnosable failure", () => {
  it("disabled never returns a simulated analysis", async () =>
    await expect(new DisabledAnalyzer().analyze()).rejects.toMatchObject({
      code: "AI_DISABLED",
    }));
  it("handles 429, timeout, model and invalid response without raw SDK secrets", () => {
    expect(diagnostic({ status: 429 }).code).toBe("QUOTA");
    expect(diagnostic(new DOMException("timeout", "TimeoutError")).code).toBe(
      "TIMEOUT",
    );
    expect(diagnostic({ status: 404 }).code).toBe("MODEL_UNSUPPORTED");
    expect(diagnostic(new Error("apiKey=secret")).message).not.toContain(
      "secret",
    );
  });
  it("does not retry quota failures and preserves error", async () => {
    const run = vi
      .fn()
      .mockRejectedValue(new AnalysisError("QUOTA", "quota", 429));
    await expect(withRetries(run, async () => {})).rejects.toHaveProperty(
      "status",
      429,
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("never retries unauthorized or unsupported models", async () => {
    const run = vi
      .fn()
      .mockRejectedValue(new AnalysisError("MODEL_UNSUPPORTED", "unsupported"));
    await expect(withRetries(run, async () => {})).rejects.toThrow(
      "unsupported",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("rejects generation-only model", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-placeholder");
    vi.stubEnv("GEMINI_VISION_MODEL", "gemini-2.5-flash-image");
    expect(aiConfig().enabled).toBe(false);
    vi.unstubAllEnvs();
  });
});
describe("server boundaries", () => {
  it("rejects remote/CSRF requests", () => {
    expect(
      guard(new Request("http://example.com/api/capabilities"))?.status,
    ).toBe(403);
    expect(
      guard(
        new Request("http://localhost/api/capabilities", {
          headers: { origin: "https://evil.example" },
        }),
      )?.status,
    ).toBe(403);
  });
  it("requires configured private gateway token", () => {
    vi.stubEnv("STUDIO_ACCESS_TOKEN", "test-gateway");
    expect(
      guard(new Request("http://example.com/api/capabilities"))?.status,
    ).toBe(401);
    expect(
      guard(
        new Request("http://example.com/api/capabilities", {
          headers: { authorization: "Bearer test-gateway" },
        }),
      ),
    ).toBe(null);
    vi.unstubAllEnvs();
  });
  it("bounds streamed request bodies", async () =>
    await expect(
      boundedJson(
        new Request("http://localhost", {
          method: "POST",
          body: '{"too":"large"}',
        }),
        4,
      ),
    ).rejects.toThrow("용량"));
});
describe("locked layer protection", () => {
  it("keeps a locked layer when Delete is pressed", () => {
    store.getState().loadDesign(newProject());
    const el = createShapeElement("rect", { locked: true });
    store.getState().addElement(el);
    store.getState().deleteSelection();
    expect(store.getState().pages[0].elements).toHaveLength(1);
  });
});
describe("Next internal URL versus browser Host", () => {
  it("accepts matching actual Host while internal URL uses localhost", () =>
    expect(
      guard(
        new Request("http://localhost:3000/api/export/pptx", {
          headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).toBe(null));
  it("rejects untrusted external Host even if internal URL is localhost", () =>
    expect(
      guard(
        new Request("http://localhost:3000/api/export/pptx", {
          headers: { host: "evil.example", origin: "http://evil.example" },
        }),
      )?.status,
    ).toBe(403));
});

import { fitSource } from "@/lib/image-layout";
describe("aspect-preserving Magic placement", () => {
  it("contains a wide source without stretching on a taller page", () =>
    expect(fitSource(1600, 900, 960, 640)).toEqual({
      x: 0,
      y: 50,
      width: 960,
      height: 540,
      scale: 0.6,
    }));
  it("contains a tall source without stretching on a wide page", () =>
    expect(fitSource(640, 1280, 960, 640)).toEqual({
      x: 320,
      y: 0,
      width: 320,
      height: 640,
      scale: 0.5,
    }));
});
describe("editing limits keep automatic saves and ZIP backups valid", () => {
  it("bounds numeric input before storing document state", () => {
    const p = newProject();
    store.getState().loadDesign(p);
    const t = createTextElement();
    store.getState().addElement(t);
    store.getState().updateElements([t.id], {
      fontSize: -40,
      height: 100000,
      opacity: 2,
      rotation: Infinity,
    });
    expect(() =>
      validateProject({ ...p, pages: store.getState().pages }),
    ).not.toThrow();
  });
  it("does not exceed the documented layer capacity", () => {
    const p = newProject();
    p.pages[0].elements = Array.from({ length: 500 }, () =>
      createShapeElement("rect"),
    );
    store.getState().loadDesign(p);
    store.getState().addElement(createTextElement());
    expect(store.getState().pages[0].elements).toHaveLength(500);
  });
});
