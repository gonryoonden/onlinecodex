import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { Project } from "@/lib/project";
const evidence = path.resolve(process.env.STUDIO_EVIDENCE_DIR || "../../evidence/studio");
const fixtures = path.resolve("../../tests/studio/fixtures");
const analysis = JSON.parse(
  fs.readFileSync(path.join(fixtures, "synthetic.analysis.json"), "utf8"),
);
type RecordData = Project;
async function snapshot(page: Page) {
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("이 브라우저에 저장됨", { exact: true }),
  ).toBeVisible();
  return page.evaluate(
    async () =>
      new Promise<RecordData>((resolve) => {
        const req = indexedDB.open("personal-magic-studio", 1);
        req.onsuccess = () => {
          const get = req.result
            .transaction("projects")
            .objectStore("projects")
            .getAll();
          get.onsuccess = () =>
            resolve(
              get.result.sort(
                (a: { updatedAt: string }, b: { updatedAt: string }) =>
                  b.updatedAt.localeCompare(a.updatedAt),
              )[0],
            );
        };
      }),
  );
}
async function output(page: Page, label: string, name: string) {
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  const d = await pending;
  await d.saveAs(path.join(evidence, name));
  expect(await d.failure()).toBeNull();
  return path.join(evidence, name);
}
async function boot(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "텍스트 추가", exact: true })
    .waitFor();
  return errors;
}
test("Korean editor: layers, persistence, two pages, ZIP in a fresh session, PNG PDF native PPTX", async ({
  page,
  browser,
}) => {
  const errors = await boot(page);
  await page.getByLabel("프로젝트 이름").fill("브라우저 검증");
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  await page
    .getByLabel("텍스트 내용", { exact: true })
    .fill("한글 텍스트 수정\n첫 페이지");
  await page.getByLabel("요소 X", { exact: true }).fill("90");
  await page.getByLabel("요소 Y", { exact: true }).fill("80");
  await page.getByLabel("레이어 이름").fill("한글 제목");
  await page.getByRole("button", { name: "사각형", exact: true }).click();
  await page.getByLabel("레이어 이름").fill("첫 페이지 도형");
  await page.getByRole("button", { name: "원", exact: true }).click();
  await page
    .getByRole("button", { name: "레이어 아래로", exact: true })
    .click();
  await page
    .getByTestId("file-upload")
    .setInputFiles(path.join(fixtures, "diamond.png"));
  await expect(page.getByTestId("layer-image")).toHaveCount(1);
  let p = await snapshot(page);
  expect(p.pages[0].elements).toHaveLength(4);
  expect(Object.values(p.assets)[0]).toMatchObject({ width: 220, height: 170 });
  const id = p.pages[0].elements.find((e) => e.type === "image")!.id;
  await page.getByLabel(`${id} 숨김`, { exact: true }).click();
  await page.getByLabel(`${id} 잠금`, { exact: true }).click();
  await page.getByTestId("layer-image").locator(".layer-name").click();
  await page.keyboard.press("Delete");
  p = await snapshot(page);
  expect(p.pages[0].elements.find((e) => e.id === id)).toMatchObject({
    locked: true,
    visible: false,
  });
  await page.getByLabel(`${id} 잠금 해제`, { exact: true }).click();
  await page.getByLabel(`${id} 표시`, { exact: true }).click();
  await page.getByTestId("layer-text").locator(".layer-name").click();
  await page.getByLabel("요소 X", { exact: true }).fill("140");
  await page.getByLabel("요소 X", { exact: true }).blur();
  await page.keyboard.press("Control+z");
  await page.getByTestId("layer-text").locator(".layer-name").click();
  await expect(page.getByLabel("요소 X", { exact: true })).toHaveValue("90");
  await page.keyboard.press("Control+Shift+z");
  await page.getByTestId("layer-text").locator(".layer-name").click();
  await expect(page.getByLabel("요소 X", { exact: true })).toHaveValue("140");
  await page
    .getByTestId("layer-rect")
    .locator(".layer-name")
    .click({ modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "요소 정렬 left", exact: true })
    .click();
  p = await snapshot(page);
  const aligned = p.pages[0].elements.filter(
    (e) => e.type === "text" || e.type === "rect",
  );
  expect(aligned[0].x).toBe(aligned[1].x);
  await page.getByRole("button", { name: "페이지 추가", exact: true }).click();
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  await page
    .getByLabel("텍스트 내용", { exact: true })
    .fill("두 번째 페이지 독립 객체");
  await page
    .getByRole("button", { name: "페이지 앞으로", exact: true })
    .click();
  p = await snapshot(page);
  expect(p.pages).toHaveLength(2);
  expect(p.pages[0].elements).toHaveLength(1);
  expect(p.pages[0].elements[0]).toHaveProperty(
    "text",
    "두 번째 페이지 독립 객체",
  );
  expect(p.pages[1].elements).toHaveLength(4);
  await page.getByRole("button", { name: "페이지 복제", exact: true }).click();
  await page.getByRole("button", { name: "페이지 삭제", exact: true }).click();
  const saved = await snapshot(page);
  await page.reload();
  await page.getByTestId("layer-text").waitFor();
  p = await snapshot(page);
  expect(p.pages).toEqual(saved.pages);
  expect(p.assets).toEqual(saved.assets);
  await page.getByRole("button", { name: "페이지 2", exact: true }).click();
  await page.getByTestId("layer-image").locator(".layer-name").click();
  await page.screenshot({ path: path.join(evidence, "editor-1366x768.png") });
  const zip = await output(
    page,
    "프로젝트 ZIP · 재편집 백업",
    "browser-project.studio.zip",
  );
  await output(page, "PNG · 현재 페이지", "browser-current.png");
  await output(page, "PDF · 모든 페이지", "browser-two-pages.pdf");
  await output(page, "PPTX · 편집 가능한 객체", "browser-two-pages.pptx");
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const fresh = await context.newPage();
  await boot(fresh);
  await fresh.getByTestId("archive-upload").setInputFiles(zip);
  await expect(
    fresh.getByText("레이어와 원본 에셋을 복원했습니다.", { exact: true }),
  ).toBeVisible();
  const restored = await snapshot(fresh);
  expect(restored.pages).toEqual(p.pages);
  expect(restored.assets).toEqual(p.assets);
  await fresh.screenshot({ path: path.join(evidence, "restored-session.png") });
  await context.close();
  fs.writeFileSync(
    path.join(evidence, "browser-project.json"),
    JSON.stringify(p, null, 2),
  );
  fs.writeFileSync(
    path.join(evidence, "console-errors.json"),
    JSON.stringify(errors, null, 2),
  );
  expect(errors).toEqual([]);
});
test("Magic offline: manual ground truth, real transparent polygon, rebuilt background and explicit residue warning", async ({
  page,
}) => {
  const errors = await boot(page);
  await page
    .getByTestId("file-upload")
    .setInputFiles(path.join(fixtures, "synthetic.png"));
  await expect(page.getByTestId("layer-image")).toHaveCount(1);
  await page.getByRole("button", { name: /AI 레이어 분해/ }).click();
  const dialog = page.getByRole("dialog", { name: "Magic Layers 검토" });
  await expect(
    dialog.getByText("AI 연결 필요: GEMINI_API_KEY 미설정", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "AI 레이어 분해", exact: true }),
  ).toBeDisabled();
  for (const r of analysis.regions) {
    await dialog
      .getByRole("button", {
        name:
          r.type === "text"
            ? "텍스트 영역"
            : r.type === "shape"
              ? "도형 영역"
              : "이미지 영역",
        exact: true,
      })
      .click();
    for (let i = 0; i < 4; i++)
      await dialog
        .getByLabel(`영역 ${["X", "Y", "너비", "높이"][i]}`, { exact: true })
        .fill(String(r.bbox[i]));
    if (r.type === "text") {
      await dialog.getByLabel("인식 텍스트 수정").fill(r.text);
      await dialog
        .getByLabel("글자 크기 (이미지 높이 /1000)", { exact: true })
        .fill(String(r.style.fontSize));
      await dialog
        .locator("fieldset")
        .first()
        .getByLabel("색", { exact: true })
        .fill(r.style.color);
    }
    if (r.type === "shape") {
      await dialog
        .getByLabel("영역 도형", { exact: true })
        .selectOption(r.shape);
      await dialog
        .locator("fieldset")
        .first()
        .getByLabel("색", { exact: true })
        .fill(r.style.color);
    }
    await dialog.getByLabel("영역 순서").fill(String(r.zIndex));
    if (r.polygon) {
      await dialog
        .getByRole("button", { name: "다각형 다시 지정", exact: true })
        .click();
      const svg = dialog.locator(".region-overlay");
      await svg.scrollIntoViewIfNeeded();
      const b = await svg.boundingBox();
      if (!b) throw new Error("SVG missing");
      for (const point of r.polygon)
        await page.mouse.click(
          b.x + (b.width * point[0]) / 1000,
          b.y + (b.height * point[1]) / 1000,
        );
      await dialog.getByRole("button", { name: /꼭짓점 확정/ }).click();
    }
  }
  await dialog.getByLabel("배경 시작 색").fill(analysis.background.from);
  await dialog.getByLabel(/원본 배경을 단색/).check();
  await dialog
    .getByRole("button", { name: "결과 미리보기", exact: true })
    .click();
  await dialog.getByAltText("레이어 변환 결과").waitFor();
  const previewData = await dialog
    .getByAltText("레이어 변환 결과")
    .getAttribute("src");
  fs.writeFileSync(
    path.join(evidence, "synthetic-reconstruction-before-edit.png"),
    Buffer.from(previewData!.split(",")[1], "base64"),
  );
  await dialog.screenshot({
    path: path.join(evidence, "magic-manual-review.png"),
  });
  await dialog
    .getByRole("button", { name: "검토한 레이어 생성", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("layer-text")).toHaveCount(2);
  let p = await snapshot(page);
  expect(p.pages).toHaveLength(2);
  expect(p.pages[1].elements).toHaveLength(7);
  expect(p.pages[1].elements.filter((e) => e.type === "image")).toHaveLength(1);
  expect(p.pages[1].elements.some((e) => e.provenance?.backgroundWarning)).toBe(
    false,
  );
  expect(Object.values(p.assets).filter((a) => !a.original)).toHaveLength(1);
  const native = p.pages[1].elements.find((e) => e.type === "text")!;
  await page
    .getByTestId("layer-text")
    .filter({ hasText: native.text.slice(0, 8) })
    .locator(".layer-name")
    .click();
  await page
    .getByLabel("텍스트 내용", { exact: true })
    .fill("이 글자는 실제로 바뀝니다");
  await page.getByLabel("요소 X", { exact: true }).fill("100");
  await output(page, "PNG · 현재 페이지", "synthetic-reconstructed.png");
  await page.getByTestId("layer-image").locator(".layer-name").click();
  await page.getByLabel("요소 X", { exact: true }).fill("500");
  await page.screenshot({
    path: path.join(evidence, "magic-reconstructed-editor.png"),
  });
  p = await snapshot(page);
  fs.writeFileSync(
    path.join(evidence, "synthetic-reconstructed-project.json"),
    JSON.stringify(p, null, 2),
  );
  await page.getByRole("button", { name: "페이지 1", exact: true }).click();
  await page.getByTestId("layer-image").locator(".layer-name").click();
  await page.getByRole("button", { name: /AI 레이어 분해/ }).click();
  await dialog
    .getByRole("button", { name: "텍스트 영역", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "검토한 레이어 생성", exact: true })
    .click();
  await expect(
    page.getByText(/배경 보정 필요 · 원본에 글자\/객체 잔상/),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("PDF pages import, malformed image rejected, real Korean original retained with AI disabled", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.getByTestId("file-upload").setInputFiles({
    name: "two.pdf",
    mimeType: "application/pdf",
    buffer: fs.readFileSync(path.join(evidence, "browser-two-pages.pdf")),
  });
  await expect(
    page.getByText(/PDF 페이지를 이미지로 가져왔습니다/),
  ).toBeVisible();
  let p = await snapshot(page);
  expect(p.pages).toHaveLength(3);
  expect(p.pages[1].elements[0].type).toBe("image");
  expect(p.pages[2].elements[0].type).toBe("image");
  await page.getByTestId("file-upload").setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("<script>alert(1)</script>"),
  });
  await expect(page.locator(".banner[role=alert]")).toContainText(
    "실제 PNG/JPEG/WebP",
  );
  await page.getByLabel("오류 닫기").click();
  const real = path.resolve("../../2024년_산업안전보건교육_주요_개정_요약.png");
  await page.getByTestId("file-upload").setInputFiles(real);
  await expect(page.getByTestId("layer-image")).toHaveCount(2);
  await page.getByRole("button", { name: /AI 레이어 분해/ }).click();
  const dialog = page.getByRole("dialog", { name: "Magic Layers 검토" });
  await expect(
    dialog.getByRole("button", { name: "AI 레이어 분해", exact: true }),
  ).toBeDisabled();
  await dialog.screenshot({
    path: path.join(evidence, "real-korean-ai-blocked.png"),
  });
  await dialog
    .getByRole("button", { name: "텍스트 영역", exact: true })
    .click();
  await dialog
    .getByLabel("인식 텍스트 수정")
    .fill("2024년 산업안전보건교육 주요 규정 개정 및 교육 체계 핵심 요약");
  await dialog.getByLabel("영역 X", { exact: true }).fill("150");
  await dialog.getByLabel("영역 Y", { exact: true }).fill("30");
  await dialog.getByLabel("영역 너비", { exact: true }).fill("720");
  await dialog.getByLabel("영역 높이", { exact: true }).fill("70");
  await dialog
    .getByRole("button", { name: "검토한 레이어 생성", exact: true })
    .click();
  await expect(
    page.getByText(/배경 보정 필요 · 원본에 글자\/객체 잔상/),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "real-korean-manual-partial-warning.png"),
  });
  const partial = await snapshot(page);
  const bg = partial.pages[partial.pages.length - 1].elements.find(
    (e) => e.provenance?.backgroundWarning,
  )!;
  const realAsset = Object.values(partial.assets).find((a) =>
    a.name.startsWith("2024년_"),
  )!;
  expect(bg.width / bg.height).toBeCloseTo(
    realAsset.width / realAsset.height,
    6,
  );
  p = await snapshot(page);
  const a = Object.values(p.assets).find((a) => a.name.startsWith("2024년_"))!;
  expect(Buffer.from(a.dataUrl.split(",")[1], "base64")).toEqual(
    fs.readFileSync(real),
  );
  expect(errors).toEqual([]);
});
test("test-only injected AI failures never change the saved project", async ({
  page,
}) => {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        model: "TEST-ONLY",
        reason: "Test-only failure injection",
      },
    }),
  );
  await boot(page);
  await page
    .getByTestId("file-upload")
    .setInputFiles(path.join(fixtures, "diamond.png"));
  await expect(page.getByTestId("layer-image")).toHaveCount(1);
  const before = await snapshot(page);
  await page.getByRole("button", { name: /AI 레이어 분해/ }).click();
  const dialog = page.getByRole("dialog", { name: "Magic Layers 검토" });
  await dialog.getByLabel(/외부 Gemini API로 이미지 전송/).check();
  for (const [code, error, status] of [
    ["QUOTA", "테스트: 할당량 초과", 429],
    ["TIMEOUT", "테스트: 시간 초과", 504],
    ["MODEL_UNSUPPORTED", "테스트: 미지원 모델", 422],
    ["INVALID_ANALYSIS", "테스트: 잘못된 분석 JSON", 422],
  ] as const) {
    await page.route("**/api/ai/magic-layers", (route) =>
      route.fulfill({ status, json: { code, error } }),
    );
    await dialog
      .getByRole("button", { name: "AI 레이어 분해", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(error);
    await page.unroute("**/api/ai/magic-layers");
  }
  await dialog.getByLabel("Magic Layers 닫기").click();
  const after = await snapshot(page);
  expect(after.pages).toEqual(before.pages);
  expect(after.assets).toEqual(before.assets);
});
test("test-only storage quota failure exposes a usable manual ZIP backup", async ({
  page,
}) => {
  await boot(page);
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  await page
    .getByLabel("텍스트 내용", { exact: true })
    .fill("저장 실패에도 백업할 내용");
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("TEST ONLY: 저장 공간 부족", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("저장 실패 · ZIP 백업 필요", { exact: true }),
  ).toBeVisible();
  const file = await output(
    page,
    "프로젝트 ZIP · 재편집 백업",
    "save-failure-backup.studio.zip",
  );
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const p = JSON.parse(await zip.file("project.json")!.async("string"));
  expect(p.pages[0].elements[0].text).toBe("저장 실패에도 백업할 내용");
});
test("a real Chromium process restart retains IndexedDB editing data", async () => {
  const { chromium } = await import("@playwright/test");
  const os = await import("node:os");
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), "magic-studio-restart-"),
  );
  const options = {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1366, height: 768 },
  };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = context.pages()[0];
    await boot(page);
    await page
      .getByRole("button", { name: "텍스트 추가", exact: true })
      .click();
    await page
      .getByLabel("텍스트 내용", { exact: true })
      .fill("브라우저 재시작 후에도 편집");
    const before = await snapshot(page);
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = context.pages()[0];
    await boot(page);
    await expect(page.getByTestId("layer-text")).toContainText(
      "브라우저 재시작 후에도 편집",
    );
    const after = await snapshot(page);
    expect(after.pages).toEqual(before.pages);
    await page.screenshot({
      path: path.join(evidence, "browser-restart-restored.png"),
    });
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
test('JPEG EXIF and WebP retain original bytes and aspect ratio through native image export',async({page})=>{
 await boot(page);await page.getByTestId('file-upload').setInputFiles(path.join(fixtures,'synthetic-exif.jpg'));await expect(page.getByTestId('layer-image')).toHaveCount(1);await page.getByTestId('file-upload').setInputFiles(path.join(fixtures,'synthetic.webp'));await expect(page.getByTestId('layer-image')).toHaveCount(2);const p=await snapshot(page);
 const jpg=Object.values(p.assets).find(a=>a.mime==='image/jpeg')!;const webp=Object.values(p.assets).find(a=>a.mime==='image/webp')!;expect(jpg).toMatchObject({width:640,height:960});expect(webp).toMatchObject({width:960,height:640});expect(Buffer.from(jpg.dataUrl.split(',')[1],'base64')).toEqual(fs.readFileSync(path.join(fixtures,'synthetic-exif.jpg')));const el=p.pages[0].elements.find(e=>e.assetId===jpg.id)!;expect(el.width/el.height).toBeCloseTo(640/960,6);await output(page,'PPTX · 편집 가능한 객체','formats-images.pptx');
});

test("Local repair and grayscale PNG mask: synthetic fixture, invalidation, persistence and native exports", async ({ page }) => {
  await page.route("**/api/capabilities", route => route.fulfill({ json: { enabled: true, model: "synthetic-test-only", reason: "fixture" } }));
  await boot(page);
  await page.getByTestId("file-upload").setInputFiles(path.join(fixtures, "synthetic.png"));
  const maskPng = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "black"; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(16, 16, 12, 0, Math.PI * 2); ctx.fill();
    return canvas.toDataURL();
  });
  const fixture = structuredClone(analysis);
  fixture.background.kind = "complex";
  for (const r of fixture.regions) if (r.type === "image") { delete r.polygon; r.maskPng = maskPng; }
  await page.route("**/api/ai/magic-layers", route => route.fulfill({ json: { analysis: fixture, provenance: { model: "synthetic-fixture-NOT-LIVE" } } }));
  await page.getByRole("button", { name: /AI 레이어 분해/ }).click();
  const dialog = page.getByRole("dialog", { name: "Magic Layers 검토" });
  await dialog.getByLabel("외부 Gemini API로 이미지 전송에 동의합니다.").check();
  await dialog.getByRole("button", { name: "AI 레이어 분해", exact: true }).click();
  await expect(dialog.getByText(/Gemini · 모든 결과 확인 필요/)).toBeVisible();
  await dialog.getByRole("button", { name: "로컬 배경 보정", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("로컬 복원 적용", { timeout: 60000 });
  await dialog.getByLabel("인식 텍스트 수정").fill("복원 후 한글 수정");
  await expect(dialog.getByText(/영역·설정이 변경되었습니다/)).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await dialog.getByRole("button", { name: "로컬 배경 보정", exact: true }).click();
  await expect(dialog.getByRole("status")).toBeVisible({ timeout: 60000 });
  await dialog.getByRole("button", { name: "결과 미리보기", exact: true }).click();
  await expect(dialog.getByAltText("레이어 변환 결과")).toBeVisible();
  await dialog.screenshot({ path: path.join(evidence, "local-repair-synthetic-review.png") });
  await dialog.getByRole("button", { name: "검토한 레이어 생성", exact: true }).click();
  const project = await snapshot(page);
  const rebuilt = project.pages.at(-1)!;
  expect(rebuilt.elements.some(e => e.provenance?.method === "local-inpaint-approximation")).toBe(true);
  expect(rebuilt.elements.some(e => e.type === "text" && e.text === "복원 후 한글 수정")).toBe(true);
  const masked = Object.values(project.assets).find(a => a.name.includes("PNG 마스크"))!;
  expect(masked).toBeTruthy();
  const alpha = await page.evaluate(async url => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    return { corner: ctx.getImageData(0, 0, 1, 1).data[3], center: ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data[3] };
  }, masked.dataUrl);
  expect(alpha).toEqual({ corner: 0, center: 255 });
  fs.writeFileSync(path.join(evidence, "local-repair-project.json"), JSON.stringify(project));
  await output(page, "PNG · 현재 페이지", "local-repair.png");
  await output(page, "PDF · 모든 페이지", "local-repair.pdf");
  await output(page, "PPTX · 편집 가능한 객체", "local-repair.pptx");
  await page.reload();
  await expect(page.getByRole("button", { name: "텍스트 추가", exact: true })).toBeVisible();
  expect((await snapshot(page)).pages.at(-1)!.elements).toEqual(rebuilt.elements);
});

test("Real Korean source: manual title repair, native text, preserved original and exports (NOT live AI)", async ({ page }) => {
  await boot(page);
  const truth = JSON.parse(fs.readFileSync(path.join(fixtures, "real-korean.truth.json"), "utf8"));
  await page.getByTestId("file-upload").setInputFiles(path.resolve("../../2024년_산업안전보건교육_주요_개정_요약.png"));
  await page.getByRole("button", { name: /AI 레이어 분해/ }).click();
  const dialog = page.getByRole("dialog", { name: "Magic Layers 검토" });
  await dialog.getByRole("button", { name: "텍스트 영역", exact: true }).click();
  await dialog.getByLabel("인식 텍스트 수정").fill(truth.blocks[0]);
  for (const [label, value] of [["X",150],["Y",30],["너비",700],["높이",65]] as const)
    await dialog.getByLabel(`영역 ${label}`, { exact: true }).fill(String(value));
  await dialog.getByLabel("글자 크기 (이미지 높이 /1000)").fill("48");
  await dialog.locator("fieldset").first().getByLabel("색", { exact: true }).fill("#D66A87");
  await dialog.getByLabel("배경 복원 방식").selectOption("complex");
  await dialog.getByRole("button", { name: "로컬 배경 보정", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("로컬 복원 적용", { timeout: 60000 });
  await dialog.getByRole("button", { name: "결과 미리보기", exact: true }).click();
  await expect(dialog.getByAltText("레이어 변환 결과")).toBeVisible();
  await dialog.screenshot({ path: path.join(evidence, "real-korean-local-repair-review.png") });
  await dialog.getByRole("button", { name: "검토한 레이어 생성", exact: true }).click();
  await page.getByTestId("layer-text").locator(".layer-name").click();
  await page.getByLabel("텍스트 내용", { exact: true }).fill("2024년 교육 안내 · 직접 수정됨");
  await page.getByLabel("요소 X", { exact: true }).fill("100");
  await page.getByLabel("요소 X", { exact: true }).blur();
  const project = await snapshot(page);
  expect(project.pages).toHaveLength(2);
  expect(Object.values(project.assets).some(a => a.original && a.name.startsWith("2024년_"))).toBe(true);
  expect(project.pages[1].elements.some(e => e.type === "text" && e.text.includes("직접 수정됨"))).toBe(true);
  await page.screenshot({ path: path.join(evidence, "real-korean-title-moved.png") });
  await output(page, "PNG · 현재 페이지", "real-manual.png");
  await output(page, "PDF · 모든 페이지", "real-manual.pdf");
  await output(page, "PPTX · 편집 가능한 객체", "real-manual.pptx");
  await page.reload();
  await expect(page.getByRole("button", { name: "텍스트 추가", exact: true })).toBeVisible();
  expect((await snapshot(page)).pages[1].elements).toEqual(project.pages[1].elements);
});

test("Recorded LIVE Gemini Korean result: real regions, CPU repair, independent edits and exports (no new AI calls)", async ({ page }) => {
  const livePath = path.join(evidence, "gemini-live-improved.json");
  test.skip(!fs.existsSync(livePath), "Requires explicitly saved live response; never fabricate success");
  const live = JSON.parse(fs.readFileSync(livePath, "utf8"));
  expect(live.status).toBe(200);
  await page.route("**/api/capabilities", route => route.fulfill({ json: { enabled: true, model: live.result.provenance.model, reason: "recorded live response replay" } }));
  await page.route("**/api/ai/magic-layers", route => route.fulfill({ json: live.result }));
  await boot(page);
  await page.getByTestId("file-upload").setInputFiles(path.resolve("../../2024년_산업안전보건교육_주요_개정_요약.png"));
  await page.getByRole("button", { name: /AI 레이어 분해/ }).click();
  const dialog = page.getByRole("dialog", { name: "Magic Layers 검토" });
  await dialog.getByLabel("외부 Gemini API로 이미지 전송에 동의합니다.").check();
  await dialog.getByRole("button", { name: "AI 레이어 분해", exact: true }).click();
  await expect(dialog.locator(".region-row")).toHaveCount(live.result.analysis.regions.length);
  const repairResponse = page.waitForResponse(r => r.url().includes("/api/magic-layers/background"));
  await dialog.getByRole("button", { name: "로컬 배경 보정", exact: true }).click();
  const repair = await repairResponse;
  const repairResult = await repair.json();
  fs.writeFileSync(path.join(evidence, "live-result-repair-diagnostics.json"), JSON.stringify({status:repair.status(), diagnostics:repairResult.diagnostics,error:repairResult.error},null,2));
  expect(repair.status(), repairResult.error).toBe(200);
  await expect(dialog.getByRole("status")).toBeVisible({ timeout: 60000 });
  await dialog.getByRole("button", { name: "결과 미리보기", exact: true }).click();
  const preview = dialog.getByAltText("레이어 변환 결과");
  await expect(preview).toBeVisible();
  fs.writeFileSync(path.join(evidence,"live-result-before-edit.png"),Buffer.from((await preview.getAttribute("src"))!.split(",")[1],"base64"));
  await dialog.screenshot({path:path.join(evidence,"live-result-review.png")});
  await dialog.getByRole("button", { name: "검토한 레이어 생성", exact: true }).click();
  await expect(page.getByTestId("layer-text")).toHaveCount(19);
  let project = await snapshot(page);
  const images = project.pages[1].elements.filter(e => e.type === "image" && !e.locked);
  expect(images.length).toBe(27);
  const target = images[0];
  await page.getByTestId("layer-image").filter({has:page.getByLabel(`${target.id} 숨김`,{exact:true})}).locator(".layer-name").click();
  await page.getByLabel("요소 X",{exact:true}).fill(String(target.x+25));
  await page.getByLabel("요소 너비",{exact:true}).fill(String(Math.max(10,target.width*.8)));
  await page.getByLabel("요소 너비",{exact:true}).blur();
  await page.keyboard.press("Delete");
  await page.getByTestId("layer-text").locator(".layer-name").first().click();
  await page.getByLabel("텍스트 내용",{exact:true}).fill("실제 Gemini 결과 · 한글 수정 검증");
  project = await snapshot(page);
  expect(project.pages[1].elements.some(e=>e.id===target.id)).toBe(false);
  await page.screenshot({path:path.join(evidence,"live-result-after-edit.png")});
  await output(page,"PNG · 현재 페이지","live-result.png");
  await output(page,"PDF · 모든 페이지","live-result.pdf");
  await output(page,"PPTX · 편집 가능한 객체","live-result.pptx");
  await page.reload();
  await expect(page.getByRole("button",{name:"텍스트 추가",exact:true})).toBeVisible();
  expect((await snapshot(page)).pages[1].elements).toEqual(project.pages[1].elements);
});
