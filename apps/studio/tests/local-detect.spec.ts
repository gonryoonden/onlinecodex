import { test,expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../src/lib/project';
const root=process.env.STUDIO_LOCAL_DETECT_EVIDENCE;
test('local automatic pixel candidates: private input, no external API',async({page})=>{
 test.skip(!root,'Private evidence opt-in');
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:false,model:'',reason:'offline evaluation'}}));
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();
 await page.getByTestId('file-upload').setInputFiles(path.join(root!,'original.png'));
 await expect(page.getByTestId('layer-image')).toHaveCount(1);
 await page.getByRole('button',{name:/AI 레이어 분해/}).click();const d=page.getByRole('dialog');
 await d.getByRole('button',{name:'로컬 전경 후보 찾기',exact:true}).click();
 await expect(d.getByRole('button',{name:'로컬 전경 후보 찾기',exact:true})).toBeEnabled();
 const count=await d.locator('.region-row').count();expect(count).toBeGreaterThan(0);
 await d.getByLabel(/선택 영역이 단색 배경/).check();await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();
 await expect(d.getByAltText('레이어 변환 결과')).toBeVisible();
 fs.writeFileSync(path.join(root!,'auto-preview.png'),Buffer.from((await d.getByAltText('레이어 변환 결과').getAttribute('src'))!.split(',')[1],'base64'));
 await d.screenshot({path:path.join(root!,'auto-review.png')});
 await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();
 for(const [label,file] of [['프로젝트 ZIP · 편집 원본','auto.studio.zip'],['PPTX · 편집 가능한 객체 (실험)','auto.pptx'],['PPTX 다운로드 — 발표용','auto-presentation.pptx'],['변환 진단 JSON · 이미지·본문 제외','auto-diagnostic.json']]){
 await page.getByRole('button',{name:'내보내기',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();await(await pending).saveAs(path.join(root!,file));}
 const saved=()=>page.evaluate(()=>new Promise<Project>(resolve=>{const req=indexedDB.open('personal-magic-studio');req.onsuccess=()=>{const q=req.result.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);};}));
 const p=await saved(),converted=p.pages[1];
 const foreground=converted.elements.filter(e=>e.type==='image'&&!e.locked);
 expect(foreground.length).toBeGreaterThan(0);
 const background=converted.elements.find(e=>e.type==='image'&&e.locked)!;
 const residues=[];
 const png=async(file:string)=>{await page.getByRole('button',{name:'내보내기',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'PNG · 현재 페이지',exact:true}).click();await(await pending).saveAs(path.join(root!,file));};
 await page.getByRole('button',{name:'페이지 1',exact:true}).click();await png('auto-original-rendered.png');
 await page.getByRole('button',{name:'페이지 2',exact:true}).click();await png('auto-rendered.png');
 for(const [index,image]of foreground.entries()){
  expect(image.provenance?.sourcePixels).toBeDefined();
  expect(image.provenance?.mask?.assetId).toBeDefined();
  expect(p.assets[image.provenance!.mask!.assetId!].dataUrl).toMatch(/^data:image\/png/);
  const residue=await page.evaluate(async({src,rect})=>{
   const im=new Image();im.src=src;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d')!;x.drawImage(im,0,0);
   const [l,t,w,h]=rect;const d=x.getImageData(l+3,t+3,w-6,h-6).data;
   const color=[d[0],d[1],d[2]];let nonFlat=0;for(let i=0;i<d.length;i+=4)if(color.some((v,k)=>Math.abs(v-d[i+k])>3))nonFlat++;
   return {nonFlat,pixels:d.length/4,color};
  },{src:p.assets[background.assetId!].dataUrl,rect:image.provenance!.sourcePixels!});
  expect(residue.nonFlat).toBe(0);residues.push(residue);
  await page.getByTestId('layer-image').filter({has:page.getByLabel(`${image.id} 숨김`,{exact:true})}).locator('.layer-name').click();
  await page.getByLabel('요소 X',{exact:true}).fill(String(p.width+100));
  await page.getByLabel('요소 너비',{exact:true}).fill(String(Math.round(image.width/2)));
  await page.getByLabel('요소 너비',{exact:true}).blur();await png(`auto-moved-${index}.png`);
  await page.keyboard.press('Delete');await png(`auto-deleted-${index}.png`);
 }
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();
 expect((await saved()).pages[1].elements.filter(e=>e.type==='image'&&!e.locked)).toHaveLength(0);
 await page.getByRole('button',{name:'내보내기',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'PPTX · 편집 가능한 객체 (실험)',exact:true}).click();await(await download).saveAs(path.join(root!,'auto-deleted.pptx'));
 fs.writeFileSync(path.join(root!,'auto-count.json'),JSON.stringify({candidates:count,independentImages:foreground.length,externalCalls:0,residues}));
});

for(const background of ['#ffffff','#d9e8e5'])test(`local candidates preserve two separated objects on ${background}`,async({page})=>{
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:false,model:'',reason:'offline synthetic test'}}));
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();
 const src=await page.evaluate(bg=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d')!;x.fillStyle=bg;x.fillRect(0,0,600,400);x.fillStyle='#2040b0';x.beginPath();x.arc(110,130,38,0,2*Math.PI);x.fill();x.fillStyle='#208050';x.fillRect(360,220,65,60);return c.toDataURL();},background);
 await page.getByTestId('file-upload').setInputFiles({name:'synthetic-separated.png',mimeType:'image/png',buffer:Buffer.from(src.split(',')[1],'base64')});
 await page.getByRole('button',{name:/AI 레이어 분해/}).click();const d=page.getByRole('dialog');await d.getByRole('button',{name:'로컬 전경 후보 찾기',exact:true}).click();
 await expect(d.locator('.region-row')).toHaveCount(2);await d.getByLabel(/선택 영역이 단색 배경/).check();await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByAltText('레이어 변환 결과')).toBeVisible();await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();
 await expect(page.getByTestId('layer-image')).toHaveCount(3);await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();
 const masks=await page.evaluate(async()=>{
  const p=await new Promise<Project>(resolve=>{const req=indexedDB.open('personal-magic-studio');req.onsuccess=()=>{const q=req.result.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>resolve(q.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);};});
  const result=[];for(const e of p.pages[1].elements.filter(e=>e.type==='image'&&!e.locked)){
   const im=new Image();im.src=p.assets[e.assetId!].dataUrl;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d')!;x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let clear=0,opaque=0;for(let i=3;i<d.length;i+=4){if(d[i]===0)clear++;if(d[i]===255)opaque++;}result.push({clear,opaque});
  }return result;
 });
 expect(masks).toHaveLength(2);for(const m of masks){expect(m.clear).toBeGreaterThan(100);expect(m.opaque).toBeGreaterThan(1000);}
});
