import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {newProject,type Project} from '../src/lib/project';
import {createTextElement} from '../src/lib/types';
const root=path.resolve(process.env.STUDIO_BETA_EVIDENCE||'../../evidence/studio/beta');
async function boot(page:Page,enabled=false){
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled,model:'test-fixture',reason:'local test only'}}));
 await page.goto('/');if((page.viewportSize()?.width??1000)<600)await page.getByRole('button',{name:'도구 패널',exact:true}).click();await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();
}
async function save(page:Page){await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();}
async function stores(page:Page){return page.evaluate(()=>new Promise<{projects:Project[];checkpoints:Project[];version:number}>(resolve=>{const r=indexedDB.open('personal-magic-studio');r.onsuccess=()=>{const db=r.result,t=db.transaction(['projects','checkpoints']),a=t.objectStore('projects').getAll(),b=t.objectStore('checkpoints').getAll();t.oncomplete=()=>{resolve({projects:a.result,checkpoints:b.result,version:db.version});db.close();};};}));}
async function upload(page:Page,complex=false){
 const url=await page.evaluate(complex=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d')!;if(complex){const g=x.createLinearGradient(0,0,600,400);g.addColorStop(0,'#ffffff');g.addColorStop(1,'#8899aa');x.fillStyle=g;}else x.fillStyle='#ffffff';x.fillRect(0,0,600,400);x.fillStyle='#2040b0';x.beginPath();x.arc(110,130,38,0,2*Math.PI);x.fill();x.fillStyle='#208050';x.fillRect(360,220,65,60);return c.toDataURL();},complex);
 await page.getByTestId('file-upload').setInputFiles({name:'beta-synthetic.png',mimeType:'image/png',buffer:Buffer.from(url.split(',')[1],'base64')});
 await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();return page.getByRole('dialog');
}
async function output(page:Page,label:string,file:string){fs.mkdirSync(root,{recursive:true});await page.getByRole('button',{name:'내보내기',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const target=path.join(root,file);await(await pending).saveAs(target);return target;}

test('automatic flat pipeline: no external calls, reviewed independent objects and undo before processing',async({page})=>{
 let calls=0;await page.route('**/api/ai/**',r=>{calls++;return r.abort();});await boot(page,true);const d=await upload(page);
 await d.getByRole('button',{name:'자동 처리 시작',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(2);
 await expect(d.getByLabel('자동 처리 결과')).toContainText('1개 경로');
 await d.getByRole('button',{name:'자동 처리 전 영역으로 되돌리기',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(0);
 await d.getByRole('button',{name:'자동 처리 시작',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(2);
 await d.getByLabel(/선택 영역이 단색 배경/).check();await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByAltText('레이어 변환 결과')).toBeVisible();
 fs.mkdirSync(root,{recursive:true});await d.screenshot({path:path.join(root,'automatic-review.png')});
 await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();await save(page);
 const p=(await stores(page)).projects[0];expect(p.pages[1].elements.filter(e=>e.type==='image'&&!e.locked)).toHaveLength(2);expect(calls).toBe(0);
 const zip=await output(page,'프로젝트 ZIP · 편집 원본','automatic.studio.zip');await output(page,'PNG · 현재 페이지','automatic.png');
 await page.getByTestId('archive-upload').setInputFiles(zip);await expect(page.getByText('레이어와 원본 에셋을 복원했습니다.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'분석·영역 교정 열기',exact:true})).toHaveCount(0);
});

test('AI failure falls back without overwriting corrected text; cancellation discards late responses',async({page})=>{
 let calls=0;await page.route('**/api/ai/**',r=>{calls++;return r.fulfill({status:503,json:{error:'Synthetic service unavailable'}});});await boot(page,true);const d=await upload(page,true);
 await d.getByRole('button',{name:'텍스트 영역',exact:true}).click();await d.getByLabel('인식 텍스트 수정').fill('수동 교정 16시간');await d.getByLabel('영역 X',{exact:true}).fill('5');
 await d.getByLabel('외부 Gemini API로 이미지 전송에 동의합니다.').check();await d.getByRole('button',{name:'자동 처리 시작',exact:true}).click();
 await expect(d.getByLabel('자동 처리 결과')).toContainText('실패 → 대체 경로');expect(calls).toBe(1);
 await d.locator('.region-row').first().locator('button').click();await expect(d.getByLabel('인식 텍스트 수정')).toHaveValue('수동 교정 16시간');await expect(d.getByLabel('영역 X',{exact:true})).toHaveValue('5');
 await d.getByRole('button',{name:'자동 처리 전 영역으로 되돌리기',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(1);
 await page.unroute('**/api/ai/**');let release!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve);let arrived=false;
 await page.route('**/api/ai/**',async r=>{arrived=true;await waiting;await r.fulfill({status:503,json:{error:'late response'}}).catch(()=>{});});
 await d.getByRole('button',{name:'자동 처리 시작',exact:true}).click();await expect.poll(()=>arrived).toBe(true);await expect(d.getByLabel('인식 텍스트 수정')).toBeDisabled();await d.getByRole('button',{name:'자동 처리 취소',exact:true}).click();release();
 await expect(d.getByRole('button',{name:'자동 처리 시작',exact:true})).toBeEnabled();await expect(d.locator('.region-row')).toHaveCount(1);await expect(d.getByLabel('인식 텍스트 수정')).toHaveValue('수동 교정 16시간');
});

test('v1 migration, no-op checkpoints, atomic quota rollback and corrupt latest recovery',async({page})=>{
 const p=newProject('복구 검증',960,640);p.pages[0].elements=[createTextElement({text:'이전 정상 문구'})];
 await page.route('**/__seed',r=>r.fulfill({contentType:'text/html',body:'seed'}));await page.goto('/__seed');
 await page.evaluate(p=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('personal-magic-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('projects','readwrite');t.objectStore('projects').put(p);t.oncomplete=()=>{db.close();resolve();};};}),p);
 await boot(page);await expect(page.getByTestId('layer-text')).toContainText('이전 정상 문구');expect((await stores(page)).version).toBe(2);
 await page.getByTestId('layer-text').locator('.layer-name').click();await page.getByLabel('텍스트 내용',{exact:true}).fill('현재 정상 문구');await save(page);
 const good=await stores(page);expect(good.checkpoints[0].pages[0].elements[0]).toHaveProperty('text','이전 정상 문구');await save(page);expect((await stores(page)).checkpoints).toEqual(good.checkpoints);
 await page.evaluate(()=>{const proto=IDBObjectStore.prototype;const put=proto.put;proto.put=function(...args:Parameters<IDBObjectStore['put']>){if(this.name==='projects')throw new DOMException('Synthetic quota','QuotaExceededError');return put.apply(this,args);};});
 await page.getByLabel('텍스트 내용',{exact:true}).fill('저장되면 안 되는 실패 문구');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('저장 실패 · ZIP 백업 필요',{exact:true})).toBeVisible();
 const after=await stores(page);expect(after.checkpoints).toEqual(good.checkpoints);expect(after.projects[0].pages).toEqual(good.projects[0].pages);
 // Reload clears injection and unsaved UI, then corrupt only the latest record.
 page.on('dialog',d=>d.accept());await page.reload();await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();
 const broken={id:p.id,pages:'damaged',raw:'synthetic only'};
 await page.evaluate(b=>new Promise<void>(resolve=>{const r=indexedDB.open('personal-magic-studio');r.onsuccess=()=>{const db=r.result,t=db.transaction('projects','readwrite');t.objectStore('projects').put(b);t.oncomplete=()=>{db.close();resolve();};};}),broken);
 await page.reload();await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();await page.getByRole('button',{name:'내보내기',exact:true}).click();await page.getByRole('button',{name:'이전 정상 저장본 복구',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:/복구 검증/}).click();await expect(page.getByText('이전 정상 저장본을 새 프로젝트로 열었습니다. 기존 기록은 유지됩니다.',{exact:true})).toBeVisible();await expect(page.getByTestId('layer-text')).toContainText('이전 정상 문구');
 const restored=await stores(page);expect(restored.projects.find(x=>x.id===p.id)).toEqual(broken);expect(restored.projects.find(x=>x.name==='복구 검증 (정상 복구본)')?.id).not.toBe(p.id);
});

test('mobile diagnostics excludes content by default and attaches only with explicit choice',async({page})=>{
 await page.setViewportSize({width:390,height:844});await boot(page);await page.getByRole('button',{name:'텍스트 추가',exact:true}).click();await page.getByRole('button',{name:'레이어 패널',exact:true}).click();await page.getByLabel('텍스트 내용',{exact:true}).fill('PRIVATE_KOREAN_CONTENT_2026');await save(page);
 await page.getByRole('button',{name:'내보내기',exact:true}).click();await page.getByRole('button',{name:'문제 진단 ZIP · 로컬 기록',exact:true}).click();const d=page.getByRole('dialog',{name:'로컬 문제 진단'});await expect(d.getByRole('checkbox')).not.toBeChecked();
 fs.mkdirSync(root,{recursive:true});let pending=page.waitForEvent('download');await d.getByRole('button',{name:'진단 ZIP 저장',exact:true}).click();const file=path.join(root,'diagnostic-default.zip');await(await pending).saveAs(file);const z=await JSZip.loadAsync(fs.readFileSync(file));expect(z.file('project.studio.zip')).toBeNull();expect(await z.file('diagnostics.json')!.async('string')).not.toContain('PRIVATE_KOREAN_CONTENT');
 await d.getByRole('checkbox').check();pending=page.waitForEvent('download');await d.getByRole('button',{name:'진단 ZIP 저장',exact:true}).click();const included=path.join(root,'diagnostic-opt-in.zip');await(await pending).saveAs(included);expect((await JSZip.loadAsync(fs.readFileSync(included))).file('project.studio.zip')).not.toBeNull();await d.screenshot({path:path.join(root,'mobile-diagnostic.png')});
});

for(const sample of ['notebook','safety'])test(`actual ${sample}: bounded automatic route stays local and preserves source`,async({page})=>{
 const source=sample==='notebook'?process.env.STUDIO_LOCAL_DETECT_EVIDENCE&&path.join(process.env.STUDIO_LOCAL_DETECT_EVIDENCE,'original.png'):process.env.STUDIO_LOCAL_DETECT_EVIDENCE&&path.resolve('../../2024년_산업안전보건교육_주요_개정_요약.png');test.skip(!source,'Private input opt-in');
 let calls=0;await page.route('**/api/ai/**',r=>{calls++;return r.abort();});await boot(page);await page.getByTestId('file-upload').setInputFiles(source!);await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();const d=page.getByRole('dialog');
 const start=Date.now();await d.getByRole('button',{name:'자동 처리 시작',exact:true}).click();await expect(d.getByLabel('자동 처리 결과')).toBeVisible();const elapsedMs=Date.now()-start,candidates=await d.locator('.region-row').count();fs.mkdirSync(root,{recursive:true});await d.screenshot({path:path.join(root,`${sample}-automatic-review.png`)});
 let editableImages=0;
 if(candidates){await d.getByLabel(/선택 영역이 단색 배경/).check();await d.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(d.getByAltText('레이어 변환 결과')).toBeVisible();await d.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();await save(page);const p=(await stores(page)).projects[0];editableImages=p.pages[1].elements.filter(e=>e.type==='image'&&!e.locked).length;expect(p.pages[0].elements).toHaveLength(1);await output(page,'PNG · 현재 페이지',`${sample}-automatic.png`);await output(page,'프로젝트 ZIP · 편집 원본',`${sample}-automatic.studio.zip`);}
 else await expect(d.getByRole('button',{name:'검토한 레이어 생성',exact:true})).toBeDisabled();
 if(sample==='notebook')expect(editableImages).toBe(2);expect(calls).toBe(0);fs.writeFileSync(path.join(root,`${sample}-automatic.json`),JSON.stringify({candidates,editableImages,elapsedMs,externalCalls:calls,semanticCompleteness:'not certified',originalRetained:true},null,2));
});
