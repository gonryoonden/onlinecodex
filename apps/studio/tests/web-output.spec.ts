import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { projectZip } from "../src/lib/archive";
import { newProject, validateProject, type Project } from "../src/lib/project";
import { createPage, createTextElement, createShapeElement, createImageElement, createTableElement, createBarChartElement, createLineElement } from "../src/lib/types";
const root = path.resolve(process.env.STUDIO_WEB_EVIDENCE || "../../evidence/studio/web");
const picture = fs.readFileSync(path.resolve("../../tests/studio/fixtures/diamond.png"));

async function boot(page: Page) {
  await page.route("**/api/capabilities", r=>r.fulfill({json:{enabled:false,model:"",reason:"offline evaluation"}}));
  await page.goto("/"); await page.getByRole("button", {name:"텍스트 추가",exact:true}).waitFor();
}
async function stored(page: Page): Promise<Project> {
  await page.getByRole("button",{name:"저장",exact:true}).click();
  await expect(page.getByText("이 브라우저에 저장됨",{exact:true})).toBeVisible();
  return page.evaluate(()=>new Promise<Project>(resolve=>{
    const req=indexedDB.open("personal-magic-studio"); req.onsuccess=()=>{
      const db=req.result,q=db.transaction("projects").objectStore("projects").getAll();
      q.onsuccess=()=>{resolve(q.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);db.close();};
    };
  }));
}
async function output(page:Page,label:string,file:string,scale?:string) {
  await page.getByRole("button",{name:"내보내기",exact:true}).click();
  if(scale) await page.getByLabel("출력 해상도").selectOption(scale);
  const pending=page.waitForEvent("download");
  await page.getByRole("button",{name:label,exact:true}).click();
  const d=await pending; expect(await d.failure()).toBeNull();
  const target=path.join(root,file); await d.saveAs(target); return target;
}
function example() {
  const p=newProject("웹 중심 출력 검증",960,640);
  p.assets.icon={id:"icon",name:"transparent diamond",width:220,height:170,mime:"image/png",original:true,dataUrl:`data:image/png;base64,${picture.toString("base64")}`};
  const title=(text:string)=>createTextElement({text,fontFamily:"Noto Sans KR",x:40,y:30,width:850,height:70,fontSize:36});
  const icon=(x:number,y:number)=>createImageElement(p.assets.icon.dataUrl,220,170,{assetId:"icon",x,y,width:220,height:170});
  p.pages=[
    {...createPage(),elements:[title("한글 교육 안내 · 2026"),createTextElement({text:"안전교육 A-12 · 1,250명 / 80.5%\n줄바꿈과 자간 보존",fontFamily:"Noto Sans KR",x:55,y:140,width:800,height:180,fontSize:28,lineHeight:1.7,letterSpacing:1.3}),icon(630,390)]},
    {...createPage(),elements:[title("아이콘 · 투명도 · 그림자"),createShapeElement("rect",{x:90,y:150,width:310,height:220,fill:"#d9e8e5",cornerRadius:24,rotation:8,shadow:{enabled:true,color:"#222222",blur:16,offsetX:12,offsetY:15}}),icon(140,190),createLineElement({x:470,y:310,width:250,stroke:"#224488",strokeWidth:8,arrowStart:true,arrowEnd:true,rotation:-15})]},
    {...createPage(),elements:[title("검토한 표와 차트 · 웹 회전"),createTableElement({x:60,y:150,width:360,height:220,rotation:7,fontFamily:"Noto Sans KR",rows:3,cols:2,colWidths:[1,1],cells:[{text:"과정"},{text:"인원"},{text:"교육 A"},{text:"1250"},{text:"교육 B"},{text:"80"}]}),createBarChartElement({x:470,y:160,width:380,height:300,rotation:-7,fontFamily:"Noto Sans KR",seriesName:"인원",data:[{label:"교육 A",value:1250},{label:"교육 B",value:80}]})]},
    {...createPage(),background:{type:"gradient" as const,from:"#e5edf5",to:"#ced0b8",angle:32},elements:[title("겹침 · 작은 혼합 문자"),createShapeElement("ellipse",{x:200,y:180,width:300,height:230,fill:"#406080",opacity:.65}),icon(370,270),createTextElement({text:"FAQ 01: 2026-11-06\n작은 글자 12px / 0.75%",fontFamily:"Noto Sans KR",x:70,y:500,width:500,height:60,fontSize:12,lineHeight:1.5})]}
  ];
  p.sources[p.pages[0].id]="icon";
  p.pages[0].elements.at(-1)!.provenance={source:"icon",method:"synthetic-mask-test",review:true,
    mask:{bbox:[0,0,1000,1000],polygon:[[0,0],[1000,0],[1000,1000],[0,1000]]}};
  return validateProject(p);
}

test("web original ZIP: fresh session edits, matching high-resolution presentation, PDF and Canvas",async({page,browser})=>{
  fs.mkdirSync(root,{recursive:true});let external=0; const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/api/ai/**",r=>{external++;return r.abort();});
  await boot(page);const p=example();
  const input=Buffer.from(await (await projectZip(p)).arrayBuffer());
  fs.writeFileSync(path.join(root,"synthetic-input.studio.zip"),input);
  await page.getByTestId("archive-upload").setInputFiles({name:"synthetic-input.studio.zip",mimeType:"application/zip",buffer:input});
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue(`${p.name} (복원)`);
  const pngs:string[]=[];
  for(let i=0;i<p.pages.length;i++) {
    await page.getByRole("button",{name:`페이지 ${i+1}`,exact:true}).click();
    pngs.push(await output(page,"PNG · 현재 페이지",`page-${i+1}.png`,"2"));
    await page.keyboard.press("Escape");
    await page.getByTestId("artboard").screenshot({path:path.join(root,`canvas-${i+1}.png`)});
  }
  const pptx=await output(page,"PPTX 다운로드 — 발표용","presentation.pptx");
  await expect(page.getByText(/각 슬라이드는 완성된 페이지 이미지입니다/)).toBeVisible();
  const z=await JSZip.loadAsync(fs.readFileSync(pptx));
  for(let i=0;i<p.pages.length;i++) {
    expect(Buffer.from(await z.file(`ppt/media/page-${i+1}.png`)!.async("uint8array"))).toEqual(fs.readFileSync(pngs[i]));
    expect((await z.file(`ppt/slides/slide${i+1}.xml`)!.async("string")).match(/<p:pic>/g)).toHaveLength(1);
    expect((await sharp(pngs[i]).metadata()).width).toBe(1920);
  }
  await output(page,"PDF · 모든 페이지","presentation.pdf");
  const before=await stored(page);
  const backup=await output(page,"프로젝트 ZIP · 편집 원본","original.studio.zip");
  const context=await browser.newContext({viewport:{width:1366,height:768}}),fresh=await context.newPage();
  await boot(fresh);await fresh.getByTestId("archive-upload").setInputFiles(backup);
  await expect(fresh.getByText("레이어와 원본 에셋을 복원했습니다.",{exact:true})).toBeVisible();
  const restored=await stored(fresh);expect(restored.pages).toEqual(before.pages);expect(restored.assets).toEqual(before.assets);expect(restored.sources).toEqual(before.sources);
  for(let i=0;i<before.pages.length;i++){
    await fresh.getByRole("button",{name:`페이지 ${i+1}`,exact:true}).click();
    const file=await output(fresh,"PNG · 현재 페이지",`restored-${i+1}.png`,"2");expect(fs.readFileSync(file)).toEqual(fs.readFileSync(pngs[i]));
  }
  await fresh.getByRole("button",{name:"페이지 1",exact:true}).click();
  await fresh.getByTestId("layer-text").filter({has:fresh.getByLabel(`${before.pages[0].elements[0].id} 숨김`,{exact:true})}).locator(".layer-name").click();
  await fresh.getByLabel("텍스트 내용",{exact:true}).fill("ZIP 복원 후 한글 수정 2026");
  await fresh.getByTestId("layer-image").locator(".layer-name").click();
  await fresh.getByLabel("요소 X",{exact:true}).fill("500");
  const edited=await stored(fresh);expect(edited.pages[0].elements[0]).toHaveProperty("text","ZIP 복원 후 한글 수정 2026");
  expect(edited.pages[0].elements.at(-1)).toHaveProperty("x",500);
  await output(fresh,"PNG · 현재 페이지","edited.png");await output(fresh,"PPTX 다운로드 — 발표용","edited.pptx");
  const resaved=await output(fresh,"프로젝트 ZIP · 편집 원본","edited.studio.zip");
  await fresh.getByTestId("archive-upload").setInputFiles(resaved);
  await expect(fresh.getByText("레이어와 원본 에셋을 복원했습니다.",{exact:true})).toBeVisible();
  expect((await stored(fresh)).pages).toEqual(edited.pages);
  await context.close();
  fs.writeFileSync(path.join(root,"web-evidence.json"),JSON.stringify({pages:p.pages.length,externalCalls:external,presentationPixelEquality:true,zipPageAssetEquality:true,zipRenderEquality:true,editedAndResaved:true,errors},null,2));
  expect(external).toBe(0);expect(errors).toEqual([]);
});

test("presentation cancellation leaves the project editable and does not download a partial file",async({page})=>{
  await boot(page);await page.getByRole("button",{name:"텍스트 추가",exact:true}).click();
  await page.getByLabel("텍스트 내용",{exact:true}).fill("취소 후에도 보존");
  const before=await stored(page);let downloads=0;page.on("download",()=>downloads++);
  // Keep template fetch pending long enough for a deterministic real cancellation.
  await page.route("**/native-pptx-template.pptx",async route=>{await new Promise(r=>setTimeout(r,600));await route.abort();});
  await page.getByRole("button",{name:"내보내기",exact:true}).click();
  await page.getByRole("button",{name:"PPTX 다운로드 — 발표용",exact:true}).click();
  await page.getByRole("button",{name:"출력 취소",exact:true}).click();
  await expect(page.getByRole("button",{name:"내보내기",exact:true})).toBeEnabled();
  expect((await stored(page)).pages).toEqual(before.pages);expect(downloads).toBe(0);
});

test("Korean mixed text fits its box without changing characters, line breaks or styles",async({page,browser})=>{
  fs.mkdirSync(root,{recursive:true});await boot(page);
  const text="한글 OCR 검토 2026\n교육 A-12 · 1,250명 / 80.5%";
  await page.getByRole("button",{name:"텍스트 추가",exact:true}).click();
  await page.getByLabel("텍스트 내용",{exact:true}).fill(text);
  await page.getByLabel("요소 너비",{exact:true}).fill("320");
  await page.getByLabel("요소 높이",{exact:true}).fill("90");
  await page.getByLabel("글자 크기",{exact:true}).fill("64");
  await page.getByLabel("텍스트 행간",{exact:true}).fill("1.5");
  await page.getByLabel("텍스트 자간",{exact:true}).fill("1.2");
  await page.getByRole("button",{name:"텍스트 상자에 맞춤",exact:true}).click();
  await expect(page.getByText("문자와 줄바꿈을 유지하며 글자 크기를 상자에 맞췄습니다.",{exact:true})).toBeVisible();
  const p=await stored(page),t=p.pages[0].elements[0];
  expect(t).toMatchObject({type:"text",text,lineHeight:1.5,letterSpacing:1.2});
  if(t.type!=="text")throw new Error("text missing");
  expect(t.fontSize).toBeLessThan(64);expect(t.fontSize).toBeGreaterThan(8);
  const backup=await output(page,"프로젝트 ZIP · 편집 원본","text-fit.studio.zip");
  await output(page,"PNG · 현재 페이지","text-fit.png","2");
  const context=await browser.newContext(),fresh=await context.newPage();await boot(fresh);
  await fresh.getByTestId("archive-upload").setInputFiles(backup);
  await expect(fresh.getByText("레이어와 원본 에셋을 복원했습니다.",{exact:true})).toBeVisible();
  expect((await stored(fresh)).pages).toEqual(p.pages);await context.close();
  fs.writeFileSync(path.join(root,"text-fit.json"),JSON.stringify({fontSize:t.fontSize,lineHeight:t.lineHeight,letterSpacing:t.letterSpacing,cer:0,explicitLineBreaks:1,scope:"user-entered ground truth, NOT automatic OCR"},null,2));
});

test("large web canvas exports within the pixel budget and keeps source dimensions",async({page})=>{
  fs.mkdirSync(root,{recursive:true});await boot(page);
  const p=newProject("대형 캔버스",8000,8000);
  p.pages[0].elements=[createShapeElement("rect",{x:1000,y:1000,width:6000,height:6000,fill:"#226688"})];
  await page.getByTestId("archive-upload").setInputFiles({name:"large.studio.zip",mimeType:"application/zip",buffer:Buffer.from(await(await projectZip(p)).arrayBuffer())});
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue(`${p.name} (복원)`);
  const file=await output(page,"PNG · 현재 페이지","large-capped.png","3");
  const meta=await sharp(file).metadata();expect([meta.width,meta.height]).toEqual([4000,4000]);
  const center=await sharp(file).extract({left:2000,top:2000,width:1,height:1}).removeAlpha().raw().toBuffer();
  expect([...center]).toEqual([34,102,136]);
  await output(page,"PPTX 다운로드 — 발표용","large-capped.pptx");
  const after=await stored(page);expect([after.width,after.height]).toEqual([8000,8000]);expect(after.pages).toEqual(validateProject(p).pages);
});

test("one damaged saved record never hides a healthy project and can be preserved without deletion",async({page})=>{
  await boot(page);await page.getByRole("button",{name:"텍스트 추가",exact:true}).click();
  await page.getByLabel("텍스트 내용",{exact:true}).fill("정상 프로젝트 보존");
  const healthy=await stored(page);
  const broken={id:"damaged-local-test",schemaVersion:1,name:"손상 테스트",pages:"invalid",originalPayload:"synthetic recovery content"};
  await page.evaluate(record=>new Promise<void>(resolve=>{const r=indexedDB.open("personal-magic-studio");r.onsuccess=()=>{
    const db=r.result,t=db.transaction("projects","readwrite");t.objectStore("projects").put(record);t.oncomplete=()=>{db.close();resolve();};
  };}),broken);
  await page.reload();await expect(page.getByTestId("layer-text")).toContainText("정상 프로젝트 보존");
  await expect(page.getByRole("alert").filter({hasText:"원본 기록은 삭제하지 않았으며"})).toBeVisible();
  const pending=page.waitForEvent("download");await page.getByRole("button",{name:"손상 기록 보존 다운로드",exact:true}).click();
  const file=path.join(root,"recovery.json");fs.mkdirSync(root,{recursive:true});await(await pending).saveAs(file);
  expect(JSON.parse(fs.readFileSync(file,"utf8")).records).toEqual([broken]);
  await page.getByRole("button",{name:"프로젝트",exact:true}).click();
  const library=page.getByRole("dialog");await expect(library).toContainText(healthy.name);
  const stillPresent=await page.evaluate(()=>new Promise<unknown>(resolve=>{const r=indexedDB.open("personal-magic-studio");r.onsuccess=()=>{
    const db=r.result,q=db.transaction("projects").objectStore("projects").get("damaged-local-test");q.onsuccess=()=>{resolve(q.result);db.close();};
  };}));
  expect(stillPresent).toEqual(broken);
});
