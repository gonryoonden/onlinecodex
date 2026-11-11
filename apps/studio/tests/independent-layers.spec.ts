import JSZip from 'jszip';
import {test,expect,type Page,type Browser} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type {Project} from '../src/lib/project';
const out=path.resolve(process.env.STUDIO_LOOP_EVIDENCE||'../../work/loop-browser');
async function saved(page:Page):Promise<Project>{
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();
 return page.evaluate(()=>new Promise<Project>(resolve=>{const q=indexedDB.open('personal-magic-studio');q.onsuccess=()=>{const r=q.result.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);};}));
}

async function output(page:Page,label:string,file:string){
 await page.getByRole('button',{name:'내보내기',exact:true}).click();const wait=page.waitForEvent('download');
 await page.getByRole('button',{name:label,exact:true}).click();await(await wait).saveAs(path.join(out,file));
}
async function exercise(page:Page,browser:Browser,p:Project,index:number,name:string,imageId:string,shapeId:string){
 const pg=p.pages[index],text=pg.elements.find(e=>e.type==='text'&&e.visible)!,image=pg.elements.find(e=>e.provenance?.regionId===imageId)!,shape=pg.elements.find(e=>e.provenance?.regionId===shapeId)!;
 expect(image.visible).toBe(true);expect(shape.visible).toBe(true);
 const alpha=await page.evaluate(async url=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d')!;x.drawImage(im,0,0);const data=x.getImageData(0,0,c.width,c.height).data;let clear=0,ink=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)clear++;if(data[i]>127)ink++;}return {clear,ink};},image.type==='image'?image.src:'');
 expect(alpha.clear).toBeGreaterThan(0);expect(alpha.ink).toBeGreaterThan(0);
 const row=(id:string)=>page.locator('.layer-row').filter({has:page.getByLabel(`${id} 숨김`,{exact:true})});
 await row(text.id).locator('.layer-name').click();await page.getByLabel('텍스트 내용',{exact:true}).fill('Loop 검증 · 수정 완료');
 await row(shape.id).locator('.layer-name').click();await page.getByLabel('도형 색',{exact:true}).fill('#55aa22');
 await row(image.id).locator('.layer-name').click();await page.getByLabel('요소 X',{exact:true}).fill('700');await page.getByLabel('요소 X',{exact:true}).blur();
 let edited=await saved(page);expect(edited.pages[index].elements.find(e=>e.id===image.id)?.x).toBe(700);expect(edited.pages[index].elements.find(e=>e.id===shape.id)).toMatchObject({fill:'#55aa22'});
 await output(page,'PNG · 현재 페이지',`${name}-edited.png`);await output(page,'PPTX · 편집 가능한 객체 (실험)',`${name}.pptx`);await output(page,'프로젝트 ZIP · 편집 원본',`${name}.studio.zip`);edited=await saved(page);
 const pptx=await JSZip.loadAsync(fs.readFileSync(path.join(out,`${name}.pptx`)));const xmls=await Promise.all(Object.keys(pptx.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).map(n=>pptx.file(n)!.async('string')));
 expect(xmls.join('')).toContain('Loop 검증');expect(xmls[index]).toContain('55AA22');expect(xmls[index]).toContain('<p:pic>');
 const context=await browser.newContext(),restored=await context.newPage();await restored.goto('/');await restored.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();await restored.getByTestId('archive-upload').setInputFiles(path.join(out,`${name}.studio.zip`));await expect(restored.getByText('레이어와 원본 에셋을 복원했습니다.',{exact:true})).toBeVisible();
 const reopened=await saved(restored);expect(reopened.pages[index].elements).toEqual(edited.pages[index].elements);expect(reopened.pages[index].magicReview).toEqual(edited.pages[index].magicReview);expect(reopened.assets).toEqual(edited.assets);
 await restored.getByRole('button',{name:`페이지 ${index+1}`,exact:true}).click();await restored.getByRole('button',{name:/AI 레이어 분해/}).first().click();await expect(restored.getByRole('dialog').locator('.region-row')).toHaveCount(pg.magicReview!.analysis.regions.length);await context.close();
 await row(image.id).locator('.layer-name').click();await page.keyboard.press('Delete');const deleted=await saved(page);expect(deleted.pages[index].elements.some(e=>e.id===image.id)).toBe(false);await output(page,'PNG · 현재 페이지',`${name}-deleted.png`);
 // Explicit manual rectangle correction removes every original pixel in the reviewed box.
 const source=p.assets[p.sources[pg.id]],bgElement=pg.elements.find(e=>e.type==='image'&&e.locked)!;
 const boxes=pg.magicReview!.analysis.regions.filter(r=>p.diagnostics![pg.id].candidates!.some(o=>o.id===r.id&&o.status==='generated')).map(r=>r.bbox);
 const outsideChanged=await page.evaluate(async({source,background,boxes})=>{
  const read=async(url:string)=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d')!;x.drawImage(im,0,0);return {data:x.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};};
  const a=await read(source),b=await read(background),rects=boxes.map(([x,y,w,h])=>[Math.floor(x*a.w/1000),Math.floor(y*a.h/1000),Math.ceil((x+w)*a.w/1000),Math.ceil((y+h)*a.h/1000)]);let changed=0;
  for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){if(rects.some(([l,t,r,b])=>x>=l&&x<r&&y>=t&&y<b))continue;const i=(y*a.w+x)*4;if([0,1,2,3].some(k=>a.data[i+k]!==b.data[i+k]))changed++;}return changed;
 },{source:source.dataUrl,background:p.assets[bgElement.assetId!].dataUrl,boxes});expect(outsideChanged).toBe(0);
 const region=pg.magicReview!.analysis.regions.find(r=>r.id===imageId)!,bg=pg.elements.find(e=>e.type==='image'&&e.locked)!;
 const ghost=await page.evaluate(async({url,bbox})=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d')!;x.drawImage(im,0,0);const [l,t,w,h]=bbox;const pixels=x.getImageData(Math.floor(l*c.width/1000),Math.floor(t*c.height/1000),Math.ceil((l+w)*c.width/1000)-Math.floor(l*c.width/1000),Math.ceil((t+h)*c.height/1000)-Math.floor(t*c.height/1000)).data;let differences=0;for(let i=0;i<pixels.length;i+=4)if([0,1,2,3].some(k=>pixels[i+k]!==pixels[k]))differences++;return differences;},{url:p.assets[bg.assetId!].dataUrl,bbox:region.bbox});expect(ghost).toBe(0);
 return {allocated:pg.elements.filter(e=>e.provenance?.regionId).length,ready:pg.elements.filter(e=>e.provenance?.regionId&&e.visible).length,readyText:pg.elements.filter(e=>e.type==='text'&&e.visible).length,readyShape:pg.elements.filter(e=>e.type==='rect'&&e.visible).length,readyImage:pg.elements.filter(e=>e.type==='image'&&e.provenance?.regionId&&e.visible).length,zipReopened:true,textEdited:true,shapeEdited:true,imageMovedDeleted:true,png:true,pptxNative:true,manualRepairResidualPixels:ghost,outsideChangedPixels:outsideChanged,alpha};
}

test('recorded REAL Gemini 46-candidate response: failed repair preserves native candidates and no opaque image successes',async({page,browser})=>{
 test.setTimeout(240000);fs.mkdirSync(out,{recursive:true});
 const savedResponse=JSON.parse(fs.readFileSync('../../evidence/studio/phase3/gemini-live-improved.json','utf8')).result;
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:true,model:'recorded-real-response-NOT-new-API'}}));
 await page.route('**/api/ai/magic-layers',r=>r.fulfill({json:savedResponse}));
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();
 await page.getByTestId('file-upload').setInputFiles('../../2024년_산업안전보건교육_주요_개정_요약.png');
 await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();const d=page.getByRole('dialog');
 await d.getByLabel('원본 보존 방식').selectOption('independent');
 await d.getByLabel('외부 Gemini API로 이미지 전송에 동의합니다.').check();await d.getByRole('button',{name:'AI 레이어 분해',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(46);
 await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByAltText('레이어 변환 결과')).toBeVisible();await expect(d.getByText('실제 편집 가능 레이어: 0개',{exact:true})).toBeVisible();
 await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();let p=await saved(page);let trace=p.diagnostics![p.pages[1].id];
 expect(trace.candidates).toHaveLength(46);expect(new Set(trace.candidates!.map(o=>o.id)).size).toBe(46);
 expect(p.pages[1].elements.filter(e=>e.type==='text')).toHaveLength(19);
 expect(p.pages[1].elements.filter(e=>e.provenance?.regionId).every(e=>!e.visible)).toBe(true);
 expect(trace.candidates!.filter(o=>o.type==='text').every(o=>o.elementId&&o.status==='correction-needed')).toBe(true);
 // Every successfully allocated image must have transparent and opaque pixels; no rectangle-crop path.
 const alpha=await page.evaluate(async urls=>{const values=[];for(const url of urls){const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d')!;x.drawImage(im,0,0);const a=x.getImageData(0,0,c.width,c.height).data;let transparent=0,foreground=0;for(let i=3;i<a.length;i+=4){if(a[i]===0)transparent++;if(a[i]>127)foreground++;}values.push({transparent,foreground});}return values;},p.pages[1].elements.filter(e=>e.type==='image'&&e.provenance?.regionId).map(e=>e.type==='image'?e.src:''));
 for(const a of alpha){expect(a.transparent).toBeGreaterThan(0);expect(a.foreground).toBeGreaterThan(0);}
 await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();
 await expect(d.locator('.region-row')).toHaveCount(46); // Must resume without an API call.
 // Manual correction of the saved model's failed helmet candidate, NOT a new AI result.
 await d.locator('.region-row').filter({has:page.getByLabel('r33 채택',{exact:true})}).getByRole('button').click();await d.getByRole('button',{name:'다각형 다시 지정',exact:true}).click();
 const overlay=d.locator('svg.region-overlay'),bounds=(await overlay.boundingBox())!;
 for(const [x,y] of [[286,792],[317,793],[332,825],[335,880],[322,923],[298,938],[274,924],[267,880],[270,825]])await overlay.click({position:{x:x/1000*bounds.width,y:y/1000*bounds.height}});
 await d.getByRole('button',{name:/꼭짓점 확정/}).click();await d.getByLabel('수동 교정 배경색',{exact:true}).fill('#bce4dc');await d.getByLabel('선택 영역 수동 배경 교정 확인',{exact:true}).check();
 await d.getByRole('button',{name:'도형 영역',exact:true}).click();
 const shapeCheck=await d.locator('.region-row.active input').getAttribute('aria-label'),shapeId=shapeCheck!.replace(' 채택','');
 for(const [label,value] of [['X','10'],['Y','10'],['너비','50'],['높이','30']])await d.getByLabel(`영역 ${label}`,{exact:true}).fill(value);
 await d.getByLabel('수동 교정 배경색',{exact:true}).fill('#cbe5dc');await d.getByLabel('선택 영역 수동 배경 교정 확인',{exact:true}).check();
 await d.getByLabel(/선택 영역이 단색 배경|국소 배경 추정/).check();await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByAltText('레이어 변환 결과')).toBeVisible();await d.screenshot({path:path.join(out,'recorded-gemini-review.png')});await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();p=await saved(page);trace=p.diagnostics![p.pages[2].id];
 fs.writeFileSync(path.join(out,'recorded-gemini-result.json'),JSON.stringify({evidence:'recorded-real-Gemini-response',freshLiveCall:false,total:47,originalModelCandidates:46,manualShapeAdded:1,nativeText:p.pages[2].elements.filter(e=>e.type==='text').length,allocatedImages:p.pages[2].elements.filter(e=>e.type==='image'&&e.provenance?.regionId).length,ready:p.pages[2].elements.filter(e=>e.provenance?.regionId&&e.visible).length,alpha,inventory:trace.candidates},null,2));
 expect(trace.candidates).toHaveLength(47);expect(trace.candidates!.find(o=>o.id==='r33')).toMatchObject({maskOrigin:'manual',extraction:'polygon',status:'generated'});
 const checks=await exercise(page,browser,p,2,'recorded-gemini','r33',shapeId);
 fs.writeFileSync(path.join(out,'actual-korean-acceptance.json'),JSON.stringify({actualSource:true,evidence:'recorded-real-Gemini-with-explicit-manual-correction',freshLiveCall:false,...checks},null,2));
});

for(const name of ['eda-checklist','data-roles'])test(`actual infographic ${name}: explicit human corrections, alpha, native edits, ZIP and exports (NOT Gemini recognition)`,async({page,browser})=>{
 test.skip(!process.env.STUDIO_EXTERNAL_INFOGRAPHICS,'External originals must be supplied; this cannot count as a completed real-image gate when skipped.');test.setTimeout(240000);fs.mkdirSync(out,{recursive:true});
 const isEda=name==='eda-checklist';const input=fs.readFileSync(path.join(process.env.STUDIO_EXTERNAL_INFOGRAPHICS!,`${name}.png`));
 const source=isEda?input:await (await import('sharp')).default(input).jpeg({quality:92}).toBuffer();
 const regions=[{id:'title',type:'text',text:isEda?'EXPLORATORY DATA ANALYSIS':'WHO DOES WHAT',bbox:isEda?[285,32,430,22]:[160,37,675,13],style:{color:'#172c35',fontSize:isEda?18:10},zIndex:2,review:true},
 {id:'icon',type:'image',bbox:isEda?[80,120,55,60]:[365,112,250,44],polygon:isEda?[[96,120],[119,120],[135,138],[135,162],[119,180],[96,180],[80,162],[80,138]]:[[438,112],[542,112],[615,125],[615,143],[542,156],[438,156],[365,143],[365,125]],zIndex:2,review:true},
 {id:'manual-shape',type:'shape',shape:'rect',bbox:[10,10,35,15],style:{color:'#32857a'},zIndex:1,review:true}];
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:true,model:'human-review-NOT-GEMINI'}}));
 await page.route('**/api/ai/magic-layers',r=>r.fulfill({json:{analysis:{background:{kind:'complex',from:'#ffffff',to:'#ffffff',angle:0},regions,notes:'Explicit human inventory and illustrative polygon corrections. NOT AI recognition or semantic-mask certification.'},provenance:{model:'human-inventory-NOT-AI'}}}));
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();await page.getByTestId('file-upload').setInputFiles({name:name+(isEda?'.png':'.jpg'),mimeType:isEda?'image/png':'image/jpeg',buffer:source});
 await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('원본 보존 방식').selectOption('independent');await d.getByLabel('외부 Gemini API로 이미지 전송에 동의합니다.').check();await d.getByRole('button',{name:'AI 레이어 분해',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(3);
 for(const id of ['title','icon','manual-shape']){await d.locator('.region-row').filter({has:page.getByLabel(`${id} 채택`,{exact:true})}).getByRole('button').click();await d.getByLabel('수동 교정 배경색',{exact:true}).fill(isEda?'#ffffff':'#c8c8ce');await d.getByLabel('선택 영역 수동 배경 교정 확인',{exact:true}).check();}
 await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByText('실제 편집 가능 레이어: 3개',{exact:true})).toBeVisible();await d.screenshot({path:path.join(out,`${name}-review.png`)});await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();const p=await saved(page);
 const checks=await exercise(page,browser,p,1,name,'icon','manual-shape');
 fs.writeFileSync(path.join(out,`${name}-acceptance.json`),JSON.stringify({actualSource:true,evidence:'human-inventory-and-manual-polygon-NOT-Gemini',freshLiveCall:false,inputMime:isEda?'image/png':'image/jpeg',...checks},null,2));
});
