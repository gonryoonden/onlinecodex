import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type {Project} from '../src/lib/project';
const out=path.resolve(process.env.STUDIO_INTEGRATED_EVIDENCE||'../../work/integrated-beta');
async function saved(page:Page):Promise<Project>{
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();
 return page.evaluate(()=>new Promise<Project>(resolve=>{const q=indexedDB.open('personal-magic-studio');q.onsuccess=()=>{const r=q.result.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);};}));
}
for(const kind of ['real-korean','nested-card','complex-manual',...(process.env.STUDIO_EXTERNAL_INFOGRAPHICS?['eda-checklist','data-roles']:[])])test(`integrated editing and ZIP restore: ${kind} (recorded inventory, NOT live AI)`,async({page,browser})=>{
 test.setTimeout(240000);fs.mkdirSync(out,{recursive:true});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:true,model:'recorded-inventory-NOT-LIVE'}}));
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();const external=['eda-checklist','data-roles'].includes(kind),isReal=kind==='real-korean'||external;
 const source=external?fs.readFileSync(path.join(process.env.STUDIO_EXTERNAL_INFOGRAPHICS!,`${kind}.png`)):isReal?fs.readFileSync(path.resolve('../../2024년_산업안전보건교육_주요_개정_요약.png')):Buffer.from((await page.evaluate(complex=>{
  const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d')!;x.fillStyle='#ffffff';x.fillRect(0,0,600,400);
  if(complex){const g=x.createLinearGradient(0,0,600,400);g.addColorStop(0,'#e0ffee');g.addColorStop(1,'#ccddff');x.fillStyle=g;x.fillRect(0,0,600,400);}else{x.fillStyle='#eeeeee';x.fillRect(30,30,310,170);}
  x.fillStyle='#111111';x.font='24px sans-serif';x.textBaseline='top';x.fillText('안전 교육',60,60);x.fillStyle='#2266cc';x.fillRect(420,240,90,70);x.fillStyle='#cc5500';x.fillRect(30,310,100,50);return c.toDataURL();
 },kind==='complex-manual')).split(',')[1],'base64');
 const regions=external?[
  {id:'title',type:'text',text:kind==='eda-checklist'?'EXPLORATORY DATA ANALYSIS':'WHO DOES WHAT',bbox:kind==='eda-checklist'?[285,32,430,22]:[160,37,675,13],zIndex:2,review:true,style:{color:'#172c35',fontSize:kind==='eda-checklist'?18:10}},
  {id:'helmet',type:'image',bbox:kind==='eda-checklist'?[80,120,55,60]:[365,112,250,44],zIndex:2,review:true},
 ]:isReal?[
  {id:'title',type:'text',text:'2024년 산업안전보건교육 주요 개정 및 교육 체계 핵심 요약',bbox:[154,36,694,60],zIndex:2,review:true,style:{color:'#dd6c87',fontSize:44}},
  {id:'helmet',type:'image',bbox:[267,792,68,146],zIndex:2,review:true},
 ]:[
  ...(kind==='nested-card'?[{id:'card',type:'shape',shape:'rect',bbox:[50,75,516.6667,425],zIndex:0,review:true,style:{color:'#eeeeee'}}]:[]),
  {id:'title',type:'text',text:'안전 교육',bbox:[90,130,350,100],zIndex:2,review:true,style:{color:'#111111',fontSize:60}},
  {id:'helmet',type:'image',bbox:[690,585,170,205],zIndex:2,review:true},
 ];
 await page.route('**/api/ai/magic-layers',r=>r.fulfill({json:{analysis:{background:{kind:isReal||kind==='complex-manual'?'complex':'solid',from:'#ffffff',to:'#ffffff',angle:0},regions:regions.map(r=>({...r,manualBackground:{color:"#ffffff",confirmed:true}})),notes:'Recorded human inventory. NOT live recognition.'},provenance:{model:'fixture-NOT-LIVE'}}}));
 await page.getByTestId('file-upload').setInputFiles({name:`${kind}.png`,mimeType:'image/png',buffer:source});
 await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();const d=page.getByRole('dialog');
 await d.getByLabel('외부 Gemini API로 이미지 전송에 동의합니다.').check();await d.getByRole('button',{name:'AI 레이어 분해',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(regions.length);
 await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByText('실제 편집 가능 레이어: 0개',{exact:true})).toBeVisible();await expect(d.getByRole('button',{name:'검토한 레이어 생성',exact:true})).toBeDisabled();
 if(kind==='nested-card')await d.getByLabel(/선택 영역이 단색 배경/).check();
 else for(const id of ['title','helmet']){
  await d.locator('.region-row').filter({has:page.getByLabel(`${id} 채택`,{exact:true})}).getByRole('button').click();
  await d.getByLabel('수동 교정 배경색',{exact:true}).fill(external?(kind==='eda-checklist'?'#ffffff':'#c8c8ce'):isReal?'#bce4dc':'#ddecf5');await expect(d.getByLabel('선택 영역 수동 배경 교정 확인',{exact:true})).not.toBeChecked();await d.getByLabel('선택 영역 수동 배경 교정 확인',{exact:true}).check();
 }
 await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByText('실제 편집 가능 레이어: 2개',{exact:true})).toBeVisible();await d.screenshot({path:path.join(out,`${kind}-review.png`)});await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();
 const before=await saved(page),converted=before.pages[1],editable=converted.elements.filter(e=>e.provenance?.regionId);expect(editable).toHaveLength(2);const bg=converted.elements.find(e=>e.type==='image'&&e.locked)!;
 const pixelCheck=await page.evaluate(async({source,bg,regions})=>{
  const pixels=async(url:string)=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d')!;x.drawImage(im,0,0);return {data:x.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};};
  const a=await pixels(source),b=await pixels(bg),boxes=regions.filter(r=>r.type!=='shape').map(r=>{const [x,y,w,h]=r.bbox;return [Math.floor(x*a.w/1000),Math.floor(y*a.h/1000),Math.ceil((x+w)*a.w/1000),Math.ceil((y+h)*a.h/1000)];});let outsideChanged=0,nonuniform=0,erasedPixels=0;
  for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){const i=(y*a.w+x)*4,box=boxes.find(([l,t,r,b])=>x>=l&&x<r&&y>=t&&y<b);if(box){erasedPixels++;const anchor=(box[1]*a.w+box[0])*4;if([0,1,2,3].some(c=>b.data[i+c]!==b.data[anchor+c]))nonuniform++;}else if([0,1,2,3].some(c=>a.data[i+c]!==b.data[i+c]))outsideChanged++;}
  return {outsideChanged,nonuniform,erasedPixels};
 },{source:`data:image/png;base64,${source.toString('base64')}`,bg:before.assets[bg.assetId!].dataUrl,regions});
 expect(pixelCheck.outsideChanged).toBe(0);expect(pixelCheck.nonuniform).toBe(0);expect(pixelCheck.erasedPixels).toBeGreaterThan(0);
 await page.getByTestId('layer-text').locator('.layer-name').click();await page.getByLabel('텍스트 내용',{exact:true}).fill('2026년 안전 교육 · 수정 완료');const icon=editable.find(e=>e.provenance?.regionId==='helmet')!;
 await page.getByTestId('layer-image').filter({has:page.getByLabel(`${icon.id} 숨김`,{exact:true})}).locator('.layer-name').click();await page.getByLabel('요소 X',{exact:true}).fill('700');await page.getByLabel('요소 X',{exact:true}).blur();let edited=await saved(page);expect(edited.pages[1].elements.find(e=>e.id===icon.id)?.x).toBe(700);await page.keyboard.press('Delete');edited=await saved(page);expect(edited.pages[1].elements.some(e=>e.id===icon.id)).toBe(false);
 const download=async(label:string,filename:string)=>{await page.getByRole('button',{name:'내보내기',exact:true}).click();const wait=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();await(await wait).saveAs(path.join(out,filename));};
 await download('PNG · 현재 페이지',`${kind}-edited.png`);await download('프로젝트 ZIP · 편집 원본',`${kind}.studio.zip`);const archived=await saved(page);
 const context=await browser.newContext(),restored=await context.newPage();await restored.goto('/');await restored.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();await restored.getByTestId('archive-upload').setInputFiles(path.join(out,`${kind}.studio.zip`));await expect(restored.getByText('레이어와 원본 에셋을 복원했습니다.',{exact:true})).toBeVisible();const p=await saved(restored);expect(p.pages[1].elements).toEqual(archived.pages[1].elements);expect(p.assets).toEqual(archived.assets);expect(p.pages[1].elements.find(e=>e.type==='text')).toMatchObject({text:'2026년 안전 교육 · 수정 완료'});await context.close();expect(errors).toEqual([]);
 fs.writeFileSync(path.join(out,`${kind}-result.json`),JSON.stringify({kind,liveAI:false,actualSource:isReal,editableBeforeEdit:editable.length,textLayers:1,imageLayers:1,editableAfterDelete:1,zipRestored:true,pixelCheck,backgroundQuality:isReal?'manual flat approximation; texture NOT restored':'authored regression'},null,2));
});
