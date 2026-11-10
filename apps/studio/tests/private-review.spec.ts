// Opt-in local evidence. No private source/fixture is committed or uploaded by CI.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { Project } from "../src/lib/project";
const root=process.env.STUDIO_PRIVATE_REVIEW_DIR;
test("private failed infographic: identical inventory redraw vs preservation and manual CV regions (NOT live AI)",async({browser})=>{
  test.skip(!root,"Private user evidence must be explicitly supplied locally");
  test.setTimeout(180000);
  const input=path.join(root!,"original.png"),out=path.join(root!,"results");fs.mkdirSync(out,{recursive:true});
  for(const [name,fixture,mode] of [["redraw","legacy-inventory.json","redraw"],["preserved","legacy-inventory.json","preserve"],["manual-cv","manual-regions.json","preserve"]]){
    const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
    const analysis=JSON.parse(fs.readFileSync(path.join(root!,fixture),"utf8"));
    await page.route("**/api/capabilities",r=>r.fulfill({json:{enabled:true,model:"manual-test-input",reason:"NOT LIVE"}}));
    await page.route("**/api/ai/magic-layers",r=>r.fulfill({json:{analysis,provenance:{model:"manual-inventory-NOT-AI"}}}));
    await page.goto("/");await page.getByRole("button",{name:"텍스트 추가",exact:true}).waitFor();
    await page.getByTestId("file-upload").setInputFiles(input);await expect(page.getByTestId("layer-image")).toHaveCount(1);
    await page.getByRole("button",{name:/AI 레이어 분해/}).click();const d=page.getByRole("dialog");
    await d.getByLabel("외부 Gemini API로 이미지 전송에 동의합니다.").check();await d.getByRole("button",{name:"AI 레이어 분해",exact:true}).click();
    await expect(d.locator(".region-row")).toHaveCount(analysis.regions.length);await d.getByLabel("입력 이미지 종류").selectOption("illustrated");await d.getByLabel("원본 보존 방식").selectOption(mode);
    await d.getByLabel(mode==="redraw"?/원본 배경을 단색/:/선택 영역이 단색 배경/).check();
    const start=Date.now();await d.getByRole("button",{name:"결과 미리보기",exact:true}).click();await expect(d.getByAltText("레이어 변환 결과")).toBeVisible();
    fs.writeFileSync(path.join(out,`${name}-before.png`),Buffer.from((await d.getByAltText("레이어 변환 결과").getAttribute("src"))!.split(",")[1],"base64"));
    await d.screenshot({path:path.join(out,`${name}-review.png`)});const milliseconds=Date.now()-start;
    await d.getByRole("button",{name:"검토한 레이어 생성",exact:true}).click();
    const snapshot=async()=>{await page.getByRole("button",{name:"저장",exact:true}).click();await expect(page.getByText("이 브라우저에 저장됨",{exact:true})).toBeVisible();return page.evaluate(()=>new Promise<Project>(resolve=>{const q=indexedDB.open("personal-magic-studio");q.onsuccess=()=>{const r=q.result.transaction("projects").objectStore("projects").getAll();r.onsuccess=()=>resolve(r.result[0]);};}));};
    const p=await snapshot();fs.writeFileSync(path.join(out,`${name}-project.json`),JSON.stringify(p));
    fs.writeFileSync(path.join(out,`${name}-timing.json`),JSON.stringify({previewWallMs:milliseconds,heap:await page.evaluate(()=>((performance as unknown as {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize??null))}));
    const exportFile=async(label:string,file:string)=>{await page.getByRole("button",{name:"내보내기",exact:true}).click();const pending=page.waitForEvent("download");await page.getByRole("button",{name:label,exact:true}).click();await(await pending).saveAs(path.join(out,file));};
    await exportFile("PPTX · 편집 가능한 객체 (실험)",`${name}.pptx`);
    if(name==="manual-cv"){
      const text=p.pages[1].elements.find(e=>e.type==="text"),picture=p.pages[1].elements.find(e=>e.provenance?.regionId==="manual_robot");
      if(text){await page.getByTestId("layer-text").locator(".layer-name").first().click();await page.getByLabel("텍스트 내용",{exact:true}).fill("2026년 교육과정 · 직접 수정");await page.getByLabel("요소 X",{exact:true}).fill("140");await page.getByLabel("요소 X",{exact:true}).blur();}
      if(picture){await page.getByTestId("layer-image").filter({has:page.getByLabel(`${picture.id} 숨김`,{exact:true})}).locator(".layer-name").click();await page.getByLabel("요소 X",{exact:true}).fill("800");await page.getByLabel("요소 너비",{exact:true}).fill("75");await page.getByLabel("요소 너비",{exact:true}).blur();await page.keyboard.press("Delete");}
      await exportFile("PNG · 현재 페이지","manual-cv-edited.png");await exportFile("PPTX · 편집 가능한 객체 (실험)","manual-cv-edited.pptx");
      fs.writeFileSync(path.join(out,"manual-edit-availability.json"),JSON.stringify({nativeText:!!text,independentImage:!!picture}));
    }
    await context.close();
  }
});
