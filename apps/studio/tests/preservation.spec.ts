import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { Project } from "../src/lib/project";
const evidence=path.resolve(process.env.STUDIO_EVIDENCE_DIR||"../../evidence/studio");
async function saved(page:Page):Promise<Project>{
  await page.getByRole("button",{name:"저장",exact:true}).click();
  await expect(page.getByText("이 브라우저에 저장됨",{exact:true})).toBeVisible();
  return page.evaluate(()=>new Promise<Project>(resolve=>{const req=indexedDB.open("personal-magic-studio");req.onsuccess=()=>{const q=req.result.transaction("projects").objectStore("projects").getAll();q.onsuccess=()=>resolve(q.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);};}));
}
async function download(page:Page,label:string,file:string){
  await page.getByRole("button",{name:"내보내기",exact:true}).click();const pending=page.waitForEvent("download");
  await page.getByRole("button",{name:label,exact:true}).click();const d=await pending;await d.saveAs(path.join(evidence,file));
}
test("P0: residual pixels, atomic Korean replacement, image deletion, diagnostics and restore",async({page,browser})=>{
  fs.mkdirSync(evidence,{recursive:true});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/api/capabilities",r=>r.fulfill({json:{enabled:true,model:"test-fixture",reason:"test only"}}));
  await page.goto("/");await page.getByRole("button",{name:"텍스트 추가",exact:true}).waitFor();
  const image=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=400;c.height=240;const x=c.getContext("2d")!;
    x.fillStyle="#ffffff";x.fillRect(0,0,400,240);x.font='28px "Noto Sans KR"';x.textBaseline="top";x.fillStyle="#111111";x.fillText("한글 교육",20,20);
    x.fillStyle="#ee8800";x.fillRect(25,140,110,65); // undetected decoration must survive
    x.fillStyle="#2244cc";x.beginPath();x.moveTo(295,110);x.lineTo(335,150);x.lineTo(295,190);x.lineTo(255,150);x.closePath();x.fill();return c.toDataURL();});
  await page.getByTestId("file-upload").setInputFiles({name:"p0-synthetic.png",mimeType:"image/png",buffer:Buffer.from(image.split(",")[1],"base64")});
  const regions=[{id:"title",type:"text",text:"한글 교육",bbox:[37.5,62.5,450,208.3333333],zIndex:2,review:true,style:{color:"#111111",fontSize:116.6667}},
    {id:"diamond",type:"image",bbox:[625,437.5,225,375],polygon:[[737.5,458.333],[837.5,625],[737.5,791.667],[637.5,625]],zIndex:1,review:true}];
  const stages=["ai-raw","normalized"].map(name=>({name,objects:regions.map(r=>({id:r.id,type:r.type})),omitted:[],counts:{text:1,shape:0,image:1}}));
  await page.route("**/api/ai/magic-layers",r=>r.fulfill({json:{analysis:{background:{kind:"solid",from:"#ffffff",to:"#ffffff",angle:0},regions,notes:"TEST ONLY synthetic regions"},provenance:{model:"fixture-NOT-LIVE"},trace:{build:"fixture",stages}}}));
  await page.getByRole("button",{name:"고급 수동 교정",exact:true}).click();const dialog=page.getByRole("dialog");
  await dialog.getByLabel("외부 Gemini API로 이미지 전송에 동의합니다.").check();await dialog.getByRole("button",{name:"AI 레이어 분해",exact:true}).click();
  await expect(dialog.locator(".region-row")).toHaveCount(2);await dialog.getByLabel("입력 이미지 종류").selectOption("illustrated");
  await dialog.getByRole("button",{name:"결과 미리보기",exact:true}).click();await expect(dialog.getByAltText("레이어 변환 결과")).toBeVisible();
  await expect(dialog.getByText("원본 유지 · 편집 객체 미생성",{exact:true})).toBeVisible();
  await dialog.getByLabel(/선택 영역이 단색 배경/).check();
  await expect(dialog.getByRole("button",{name:"검토한 레이어 생성",exact:true})).toBeDisabled();
  await dialog.getByRole("button",{name:"결과 미리보기",exact:true}).click();await expect(dialog.getByAltText("레이어 변환 결과")).toBeVisible();
  await expect(dialog.getByText(/부분 편집 가능 · 사용자 검토 필요/)).toBeVisible();
  await dialog.screenshot({path:path.join(evidence,"p0-preserving-review.png")});
  await dialog.getByRole("button",{name:"검토한 레이어 생성",exact:true}).click();
  let p=await saved(page), converted=p.pages[1];
  expect(converted.elements.filter(e=>e.type==="text")).toHaveLength(1);
  expect(converted.elements.filter(e=>e.type==="image")).toHaveLength(2);
  const bg=converted.elements.find(e=>e.type==="image"&&e.locked)!;
  const pixels=await page.evaluate(async url=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement("canvas");c.width=400;c.height=240;const x=c.getContext("2d")!;x.drawImage(im,0,0);
    return {text:[...x.getImageData(20,20,175,40).data].filter((v,i)=>i%4!==3).every(v=>v===255),icon:[...x.getImageData(295,150,1,1).data],decoration:[...x.getImageData(50,160,1,1).data]};},p.assets[bg.assetId!].dataUrl);
  expect(pixels).toEqual({text:true,icon:[255,255,255,255],decoration:[238,136,0,255]});
  await page.getByTestId("layer-text").locator(".layer-name").click();await page.getByLabel("텍스트 내용",{exact:true}).fill("실제 수정");
  const picture=converted.elements.find(e=>e.provenance?.regionId==="diamond")!;
  await page.getByTestId("layer-image").filter({has:page.getByLabel(`${picture.id} 숨김`,{exact:true})}).locator(".layer-name").click();
  await page.getByLabel("요소 X",{exact:true}).fill("420");await page.getByLabel("요소 너비",{exact:true}).fill("100");await page.getByLabel("요소 너비",{exact:true}).blur();await page.keyboard.press("Delete");
  await download(page,"PPTX · 편집 가능한 객체 (실험)","p0-partial.pptx");
  await download(page,"변환 진단 JSON · 이미지·본문 제외","p0-diagnostics.json");
  const report=JSON.parse(fs.readFileSync(path.join(evidence,"p0-diagnostics.json"),"utf8"));const trace=report.pages[converted.id];
  expect(trace.stages.map((s:{name:string})=>s.name)).toEqual(["ai-raw","normalized","reviewed","reconstructed","saved","visible-export","pptx"]);
  expect(trace.stages.find((s:{name:string})=>s.name==="visible-export").omitted.some((o:{reason:string})=>o.reason==="removed-since-reconstruction")).toBe(true);
  expect(JSON.stringify(report)).not.toMatch(/data:image|한글 교육|실제 수정|API_KEY/);
  await download(page,"PNG · 현재 페이지","p0-edited.png");await download(page,"PDF · 모든 페이지","p0-partial.pdf");
  await download(page,"프로젝트 ZIP · 편집 원본","p0-partial.studio.zip");
  p=await saved(page);converted=p.pages[1];await page.reload();expect((await saved(page)).pages[1].elements).toEqual(converted.elements);
  await page.getByRole("button",{name:"페이지 2",exact:true}).click();
  await page.getByRole("button",{name:"페이지 복제",exact:true}).click();
  const copied=await saved(page),copy=copied.pages[2];
  expect(copied.diagnostics?.[copy.id]?.stages.find(s=>s.name==="reconstructed")?.objects.map(o=>o.id)).toEqual(copy.elements.map(e=>e.id));
  await page.keyboard.press("Control+z");expect((await saved(page)).pages).toHaveLength(2);
  await page.getByRole("button",{name:"원본을 새 페이지로 복원",exact:true}).click();expect((await saved(page)).pages).toHaveLength(3);
  await page.keyboard.press("Control+z");expect((await saved(page)).pages).toHaveLength(2);
  const context=await browser.newContext();const second=await context.newPage();await second.goto("/");await second.getByRole("button",{name:"텍스트 추가",exact:true}).waitFor();
  await second.getByTestId("archive-upload").setInputFiles(path.join(evidence,"p0-partial.studio.zip"));
  await expect(second.getByText("레이어와 원본 에셋을 복원했습니다.",{exact:true})).toBeVisible();
  const restored=await saved(second);expect(restored.diagnostics?.[converted.id]?.stages.some(s=>s.name==="pptx")).toBe(true);
  await context.close();
  await page.evaluate(()=>{
    const original=IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction=function(stores:string|string[],mode?:IDBTransactionMode,options?:IDBTransactionOptions){
      if(mode==="readwrite")throw new DOMException("test quota failure","QuotaExceededError");
      return original.call(this,stores,mode,options);
    };
  });
  await download(page,"PPTX · 편집 가능한 객체 (실험)","p0-quota-still-downloads.pptx");
  await expect(page.getByText(/PPTX 파일은 생성됐지만 진단 기록 저장에 실패/)).toBeVisible();
  expect(errors).toEqual([]);
});
