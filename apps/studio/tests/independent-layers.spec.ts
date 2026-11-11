import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type {Project} from '../src/lib/project';
const out=path.resolve(process.env.STUDIO_LOOP_EVIDENCE||'../../work/loop-browser');
async function saved(page:Page):Promise<Project>{
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();
 return page.evaluate(()=>new Promise<Project>(resolve=>{const q=indexedDB.open('personal-magic-studio');q.onsuccess=()=>{const r=q.result.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);};}));
}
test('recorded REAL Gemini 46-candidate response: failed repair preserves native candidates and no opaque image successes',async({page})=>{
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
 await page.getByRole('button',{name:'페이지 1',exact:true}).click();await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();
 await d.getByLabel('원본 보존 방식').selectOption('independent');await d.getByLabel('외부 Gemini API로 이미지 전송에 동의합니다.').check();await d.getByRole('button',{name:'AI 레이어 분해',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(46);
 await d.getByLabel(/선택 영역이 단색 배경/).check();await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByAltText('레이어 변환 결과')).toBeVisible();await d.screenshot({path:path.join(out,'recorded-gemini-review.png')});await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();p=await saved(page);trace=p.diagnostics![p.pages[2].id];
 fs.writeFileSync(path.join(out,'recorded-gemini-result.json'),JSON.stringify({evidence:'recorded-real-Gemini-response',freshLiveCall:false,total:46,nativeText:p.pages[2].elements.filter(e=>e.type==='text').length,allocatedImages:p.pages[2].elements.filter(e=>e.type==='image'&&e.provenance?.regionId).length,ready:p.pages[2].elements.filter(e=>e.provenance?.regionId&&e.visible).length,alpha,inventory:trace.candidates},null,2));
 expect(trace.candidates).toHaveLength(46);
});
