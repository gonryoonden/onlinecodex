import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type {Project} from '../src/lib/project';
const out=path.resolve(process.env.STUDIO_LOOP_EVIDENCE||'../../work/loop-browser');
async function saved(page:Page):Promise<Project>{await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();return page.evaluate(()=>new Promise<Project>(resolve=>{const q=indexedDB.open('personal-magic-studio');q.onsuccess=()=>{const r=q.result.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);};}));}
test('actual MobileSAM WASM on REAL Gemini boxes: automatic alpha and reference parity, no supplied masks',async({page})=>{
 test.setTimeout(240000);fs.mkdirSync(out,{recursive:true});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const network:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3000')&&!r.url().startsWith('data:'))network.push(r.url());});
 const cached=JSON.parse(fs.readFileSync('../../evidence/studio/phase3/gemini-live-improved.json','utf8')).result;
 expect(cached.analysis.regions.filter((r:{maskPng?:string;polygon?:unknown})=>r.maskPng||r.polygon)).toHaveLength(0);
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:true,model:'recorded-REAL-Gemini-NOT-new-call'}}));await page.route('**/api/ai/magic-layers',r=>r.fulfill({json:cached}));
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();await page.getByTestId('file-upload').setInputFiles('../../2024년_산업안전보건교육_주요_개정_요약.png');await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('외부 Gemini API로 이미지 전송에 동의합니다.').check();await d.getByRole('button',{name:'AI 레이어 분해',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(46);
 const start=Date.now();await d.getByRole('button',{name:'AI 객체 투명 분리 · 기기에서 실행',exact:true}).click();await expect(d.getByLabel('기기 분할 상태')).toContainText('모델 마스크',{timeout:180000});const elapsedMs=Date.now()-start;
 await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByAltText('레이어 변환 결과')).toBeVisible();await d.screenshot({path:path.join(out,'sam-browser-review.png')});await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();const p=await saved(page),pg=p.pages[1],helmet=pg.elements.find(e=>e.provenance?.regionId==='r33')!;
 expect(helmet?.type).toBe('image');expect(p.diagnostics![pg.id].candidates!.find(o=>o.id==='r33')).toMatchObject({maskOrigin:'segmenter',extraction:'learned-mask'});expect(pg.magicReview!.analysis.regions.find(r=>r.id==='r33')?.segmentation?.model).toBe('MobileSAM-vit_t');
 const reference=JSON.parse(fs.readFileSync('../../work/mobile-sam/probe.json','utf8')).candidates.find((o:{id:string})=>o.id==='r33');
 const alpha=await page.evaluate(async({url,referenceUrl,sourcePixels,box})=>{
  const load=async(url:string)=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d')!;x.drawImage(im,0,0);return {data:x.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};};
  const a=await load(url),b=await load(referenceUrl);let clear=0,ink=0,intersection=0,union=0;
  const left=Math.min(sourcePixels[0],box[0]),top=Math.min(sourcePixels[1],box[1]),right=Math.max(sourcePixels[0]+a.w,box[0]+b.w),bottom=Math.max(sourcePixels[1]+a.h,box[1]+b.h);
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const ax=x-sourcePixels[0],ay=y-sourcePixels[1],bx=x-box[0],by=y-box[1];const aa=ax>=0&&ay>=0&&ax<a.w&&ay<a.h&&a.data[(ay*a.w+ax)*4+3]>127,bb=bx>=0&&by>=0&&bx<b.w&&by<b.h&&b.data[(by*b.w+bx)*4]>127;if(aa||bb)union++;if(aa&&bb)intersection++;}
  for(let i=3;i<a.data.length;i+=4){if(a.data[i]===0)clear++;if(a.data[i]>127)ink++;}return {clear,ink,referenceIoU:intersection/union};
 },{url:helmet.type==='image'?helmet.src:'',referenceUrl:`data:image/png;base64,${fs.readFileSync('../../work/mobile-sam/r33-mask.png').toString('base64')}`,sourcePixels:helmet.provenance!.sourcePixels!,box:reference.maskBox});
 expect(alpha.clear).toBeGreaterThan(0);expect(alpha.ink).toBeGreaterThan(0);expect(alpha.referenceIoU).toBeGreaterThan(.95);expect(network).toEqual([]);expect(errors).toEqual([]);
 if(helmet.type==='image')fs.writeFileSync(path.join(out,'sam-browser-helmet.png'),Buffer.from(helmet.src.split(',')[1],'base64'));
 fs.writeFileSync(path.join(out,'sam-browser-result.json'),JSON.stringify({freshGeminiCall:false,manualMasks:0,totalImageCandidates:27,allocatedLearnedImages:p.diagnostics![pg.id].candidates!.filter(o=>o.extraction==='learned-mask').length,elapsedMs,alpha,network,inventory:p.diagnostics![pg.id].candidates},null,2));
});
