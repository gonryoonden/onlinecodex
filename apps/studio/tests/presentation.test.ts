import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { exportPresentationPPTX } from "../src/lib/presentation-pptx";
import { exportNativePPTX } from "../src/lib/native-pptx";
import { exportSize, presentationFrame } from "../src/lib/export-options";
import { newProject } from "../src/lib/project";
import { createPage, createTableElement } from "../src/lib/types";
const template = new Uint8Array(readFileSync("public/native-pptx-template.pptx"));
const png = readFileSync("../../tests/studio/fixtures/synthetic.png");
const render = async () => `data:image/png;base64,${png.toString("base64")}`;

it("presentation embeds exact page renders and every slide relationship, without native objects", async () => {
  const p = newProject("발표"); p.pages.push(createPage());
  p.pages[0].elements.push(createTableElement({rotation: 12}));
  const original = structuredClone(p);
  const z = await JSZip.loadAsync(await (await exportPresentationPPTX(p, {}, {template, render})).arrayBuffer());
  expect(p).toEqual(original);
  const presentation = await z.file("ppt/presentation.xml")!.async("string");
  expect(presentation.match(/<p:sldId /g)).toHaveLength(2);
  for (const n of [1,2]) {
    const xml = await z.file(`ppt/slides/slide${n}.xml`)!.async("string");
    expect(xml.match(/<p:pic>/g)).toHaveLength(1);
    expect(xml).not.toMatch(/<a:tbl>|<p:sp>|<c:chart/);
    expect(await z.file(`ppt/slides/_rels/slide${n}.xml.rels`)!.async("string")).toContain(`../media/page-${n}.png`);
    expect(Buffer.from(await z.file(`ppt/media/page-${n}.png`)!.async("uint8array"))).toEqual(png);
  }
  await expect(exportNativePPTX(p, template)).rejects.toThrow("회전한 표");
});

it("cancellation between pages does not render remaining pages or return partial output", async () => {
  const p = newProject(); p.pages.push(createPage());
  const controller = new AbortController(); let calls = 0;
  await expect(exportPresentationPPTX(p, {signal:controller.signal}, {template, render:async()=>{
    calls++; controller.abort(); return render();
  }})).rejects.toThrow();
  expect(calls).toBe(1);
});

it("rejects failed canvas output and missing layout instead of downloading broken slides", async () => {
  await expect(exportPresentationPPTX(newProject(), {}, {template, render:async()=>"data:,"})).rejects.toThrow("이미지 출력 실패");
  const z = await JSZip.loadAsync(template); z.remove("ppt/slides/_rels/slide1.xml.rels");
  await expect(exportPresentationPPTX(newProject(), {}, {template:await z.generateAsync({type:"uint8array"}),render})).rejects.toThrow("구조 오류");
});

it("bounds per-page and multipage canvas pixels while retaining aspect ratio", () => {
  for (const [w,h,n] of [[8000,8000,30],[8000,32,1],[960,640,1],[4000,2000,10]]) {
    const s=exportSize(w,h,3,n);
    expect(s.width*s.height).toBeLessThanOrEqual(16_000_000);
    expect(s.width*s.height*n).toBeLessThanOrEqual(64_000_000);
    expect(Math.max(s.width,s.height)).toBeLessThanOrEqual(8192);
    expect(Math.abs(s.width/w-s.height/h)).toBeLessThan(.04);
  }
  expect(()=>exportSize(0,960)).toThrow();
});


it("keeps very large/small web pages within Office physical limits with centered letterboxing",()=>{
  for(const [w,h] of [[8000,32],[32,8000],[32,32],[8000,8000],[960,640]]) {
    const f=presentationFrame(w,h);
    expect(f.width).toBeGreaterThanOrEqual(96);expect(f.height).toBeGreaterThanOrEqual(96);
    expect(f.width).toBeLessThanOrEqual(5376);expect(f.height).toBeLessThanOrEqual(5376);
    expect(f.image.width/f.image.height).toBeCloseTo(w/h,8);
    expect(f.image.x*2+f.image.width).toBeCloseTo(f.width,8);
    expect(f.image.y*2+f.image.height).toBeCloseTo(f.height,8);
  }
  expect(exportSize(8000,32,3)).toEqual({width:8000,height:32,scale:1});
});
