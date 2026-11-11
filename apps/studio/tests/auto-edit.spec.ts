import JSZip from 'jszip';
import {test,expect,type Page,type Browser} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type {Project} from '../src/lib/project';
const out=path.resolve(process.env.STUDIO_LOOP_EVIDENCE||'../../work/loop-browser');
async function saved(page:Page):Promise<Project>{await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();return page.evaluate(()=>new Promise<Project>(resolve=>{const q=indexedDB.open('personal-magic-studio');q.onsuccess=()=>{const r=q.result.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);};}));}
async function output(page:Page,label:string,name:string){await page.getByRole('button',{name:'내보내기',exact:true}).click();const wait=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();await(await wait).saveAs(path.join(out,name));}
async function verifyFlow(page:Page,browser:Browser,p:Project,index:number,name:string,imageId:string){
 const pg=p.pages[index],native=pg.elements.find(e=>e.type==='text'&&e.visible)!;
 expect(native).toBeTruthy();const row=(id:string)=>page.locator('.layer-row').filter({has:page.getByLabel(`${id} 숨김`,{exact:true})});
 await row(native.id).locator('.layer-name').click();await page.getByLabel('텍스트 내용',{exact:true}).fill('Automatic alpha · 편집 검증');
 await page.getByRole('button',{name:'요소',exact:true}).click();await page.getByRole('button',{name:'사각형',exact:true}).click();await page.getByLabel('도형 색',{exact:true}).fill('#55aa22');
 await output(page,'PNG · 현재 페이지',`${name}.png`);await output(page,'PDF · 모든 페이지',`${name}.pdf`);await output(page,'PPTX · 편집 가능한 객체 (실험)',`${name}.pptx`);await output(page,'프로젝트 ZIP · 편집 원본',`${name}.studio.zip`);const current=await saved(page);
 expect(fs.readFileSync(path.join(out,`${name}.pdf`)).subarray(0,5).toString()).toBe('%PDF-');const pptx=await JSZip.loadAsync(fs.readFileSync(path.join(out,`${name}.pptx`))),xml=await pptx.file(`ppt/slides/slide${index+1}.xml`)!.async('string');expect(xml).toContain('Automatic alpha');expect(xml).toContain('55AA22');expect(xml).toContain('<p:pic>');
 const context=await browser.newContext(process.env.STUDIO_PREVIEW_STORAGE?{storageState:process.env.STUDIO_PREVIEW_STORAGE}:undefined),second=await context.newPage();await second.goto('/');await second.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();await second.getByTestId('archive-upload').setInputFiles(path.join(out,`${name}.studio.zip`));await expect(second.getByText('레이어와 원본 에셋을 복원했습니다.',{exact:true})).toBeVisible();const restored=await saved(second);expect(restored.pages[index].elements).toEqual(current.pages[index].elements);expect(restored.pages[index].magicReview).toEqual(current.pages[index].magicReview);expect(restored.assets).toEqual(current.assets);await context.close();
 const original=p.assets[p.sources[pg.id]],bg=pg.elements.find(e=>e.type==='image'&&e.locked)!,rects=p.diagnostics![pg.id].candidates!.flatMap(o=>o.repair?[o.repair.rect]:[]);
 const outside=await page.evaluate(async({source,bg,rects})=>{
  const read=async(url:string)=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d')!;x.drawImage(im,0,0);return {data:x.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};};
  const a=await read(source),b=await read(bg);let changed=0;for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){if(rects.some(([l,t,w,h])=>x>=l&&x<l+w&&y>=t&&y<t+h))continue;const i=(y*a.w+x)*4;if([0,1,2,3].some(k=>a.data[i+k]!==b.data[i+k]))changed++;}return changed;
 },{source:original.dataUrl,bg:p.assets[bg.assetId!].dataUrl,rects});expect(outside).toBe(0);
 await row(imageId).locator('.layer-name').click();
 return {nativeTextEdited:true,manualNativeShapeEdited:true,PNG:true,PDF:true,nativePPTX:true,ZIPRestoredInNewBrowser:true,outsideRepairPixelsChanged:outside};
}


for(const name of ['korean','eda-checklist','data-roles'])test(`automatic edit flow ${name}: no object approvals or manual model actions`,async({page,browser})=>{
 test.setTimeout(240000);fs.mkdirSync(out,{recursive:true});const korean=name==='korean',eda=name==='eda-checklist';
 test.skip(!korean&&!process.env.STUDIO_EXTERNAL_INFOGRAPHICS,'Actual external originals required');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let analysisCalls=0;
 const cached=JSON.parse(fs.readFileSync('../../evidence/studio/phase3/gemini-live-improved.json','utf8')).result;
 const result=korean?cached:{analysis:{background:{kind:'complex',from:'#ffffff',to:'#ffffff',angle:0},regions:[{id:'title',type:'text',text:eda?'EXPLORATORY DATA ANALYSIS':'WHO DOES WHAT',bbox:eda?[285,32,430,22]:[160,37,675,13],style:{color:'#172c35',fontSize:eda?18:10},zIndex:2,review:true},{id:'icon',type:'image',bbox:eda?[80,120,55,60]:[365,112,250,44],zIndex:1,review:true}],notes:'human boxes; no provided masks'},provenance:{model:'human-box-NOT-Gemini'}};
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:true,model:'recorded-or-human-NOT-new-call'}}));await page.route('**/api/ai/magic-layers',r=>{analysisCalls++;return r.fulfill({json:result});});
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();
 const source=korean?fs.readFileSync('../../2024년_산업안전보건교육_주요_개정_요약.png'):fs.readFileSync(path.join(process.env.STUDIO_EXTERNAL_INFOGRAPHICS!,`${name}.png`));
 const buffer=name==='data-roles'?await(await import('sharp')).default(source).jpeg({quality:92}).toBuffer():source;
 await page.getByTestId('file-upload').setInputFiles({name:name+(name==='data-roles'?'.jpg':'.png'),mimeType:name==='data-roles'?'image/jpeg':'image/png',buffer});
 const d=page.getByRole('dialog',{name:'자동 편집 준비'});await expect(d).toBeVisible();const start=Date.now();
 await d.getByLabel('외부 Gemini API로 이 이미지 전송에 동의하고 자동 편집을 시작합니다.').check();
 await expect(page.getByTestId('auto-summary')).toBeVisible({timeout:180000});const elapsedMs=Date.now()-start;
 const p=await saved(page),pg=p.pages[1],candidates=p.diagnostics![pg.id].candidates!;
 expect(analysisCalls).toBe(1);expect(candidates).toHaveLength(korean?46:2);
 const metrics={source:name,sourceKind:name==='data-roles'?'JPEG':'PNG',analysis:korean?'stored actual Gemini':'human box inventory',freshGeminiCalls:0,manualImageMasks:0,analysisCalls,elapsedMs,perObjectApprovals:0,manualSAMClicks:0,layerCreateApprovals:0,total:candidates.length,ready:candidates.filter(c=>c.decision==='ready').length,warning:candidates.filter(c=>c.decision==='warning').length,review:candidates.filter(c=>c.decision==='review').length,failed:candidates.filter(c=>c.decision==='failed').length,masks:candidates.filter(c=>c.extraction==='learned-mask').length,inventory:candidates};
 fs.writeFileSync(path.join(out,`auto-${name}.json`),JSON.stringify(metrics,null,2));
 if(korean){
  for(const id of ['r11','r12','r26','r31'])expect(candidates.find(c=>c.id===id)).toMatchObject({decision:'review',reason:'interior-background-in-mask'});
  expect(candidates.find(c=>c.id==='r33')?.decision).toBe('warning');
  expect(metrics.ready+metrics.warning).toBeGreaterThan(0);expect(metrics.review/metrics.total).toBeLessThan(.7);
 }
 await page.getByRole('button',{name:'문제 객체 상세 검토',exact:true}).click();await expect(page.getByTestId('exception-row')).toHaveCount(metrics.review+metrics.failed);
 await page.screenshot({path:path.join(out,`auto-${name}.png`),fullPage:true});
 const icon=pg.elements.find(e=>e.type==='image'&&e.visible&&e.provenance?.regionId===(korean?'r33':'icon'));
 if(icon){
  await page.getByTestId('layer-image').filter({has:page.getByLabel(`${icon.id} 숨김`,{exact:true})}).locator('.layer-name').click();await page.getByLabel('요소 X',{exact:true}).fill('700');await page.getByLabel('요소 너비',{exact:true}).fill('100');await page.getByLabel('요소 너비',{exact:true}).blur();
  if(pg.elements.some(e=>e.type==='text'&&e.visible)){const flow=await verifyFlow(page,browser,await saved(page),1,`auto-${name}`,icon.id);fs.writeFileSync(path.join(out,`auto-${name}-flow.json`),JSON.stringify(flow,null,2));}
  await page.keyboard.press('Delete');expect((await saved(page)).pages[1].elements.some(e=>e.id===icon.id)).toBe(false);
 }
 if(!korean){
  // Explicit corrections, never counted as automatic mask/background success.
  // Magic Layers dialog has no accessible name in the legacy UI.
  const row=page.getByTestId('exception-row').filter({hasText:'icon'});await row.getByRole('button').click();const review=page.getByRole('dialog');
  if(eda){await review.getByRole('button',{name:'단색 내부 배경 제거 (수동)',exact:true}).click();}
  else{
   await review.getByLabel('수동 교정 배경색').fill('#cdd0d6');await review.getByLabel('선택 영역 수동 배경 교정 확인').check();
   await review.locator('.region-row').filter({hasText:'WHO DOES WHAT'}).getByRole('button').click();await review.getByLabel('수동 교정 배경색').fill('#cdd0d6');await review.getByLabel('선택 영역 수동 배경 교정 확인').check();
  }
  await review.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(review.getByAltText('레이어 변환 결과')).toBeVisible();await review.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();
  const corrected=await saved(page),cp=corrected.pages[2],ci=cp.elements.find(e=>e.type==='image'&&e.visible&&e.provenance?.regionId==='icon')!;expect(ci).toBeTruthy();
  const flow=await verifyFlow(page,browser,corrected,2,`auto-${name}-corrected`,ci.id);fs.writeFileSync(path.join(out,`auto-${name}-corrected-flow.json`),JSON.stringify({...flow,manualMaskCorrection:eda,explicitManualFlatBackground:!eda,candidates:corrected.diagnostics![cp.id].candidates},null,2));await page.keyboard.press('Delete');expect((await saved(page)).pages[2].elements.some(e=>e.id===ci.id)).toBe(false);
 }
 expect(errors).toEqual([]);
});
