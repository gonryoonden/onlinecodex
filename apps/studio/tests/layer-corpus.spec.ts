import { test,expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../src/lib/project';
const root=process.env.STUDIO_LAYER_CORPUS;
const entries=root?JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).cases:[];
for(const entry of entries)for(const mode of ['local','automatic'])test(`${mode} authored corpus web edit/ZIP restore: ${entry.id}`,async({page,browser})=>{
 const expected=JSON.parse(fs.readFileSync(path.join(root!,'results.json'),'utf8')).find((r:{case:string;strategy:string})=>r.case===entry.id&&r.strategy==='adaptive');
 const dir=path.join(root!,entry.id,mode==='local'?'web':'web-automatic');fs.mkdirSync(dir,{recursive:true});
 const boot=async(p:typeof page)=>{await p.route('**/api/capabilities',r=>r.fulfill({json:{enabled:false,reason:'offline corpus'}}));await p.goto('/');await p.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();};
 const saved=async(p:typeof page)=>{await p.getByRole('button',{name:'저장',exact:true}).click();await expect(p.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();return p.evaluate(()=>new Promise<Project>(resolve=>{const r=indexedDB.open('personal-magic-studio');r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>{resolve(q.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);db.close();};};}));};
 await boot(page);await page.getByTestId('file-upload').setInputFiles(path.join(root!,entry.id,'original.png'));await page.getByRole('button',{name:/AI 레이어 분해/}).click();const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:mode==='local'?'로컬 전경 후보 찾기':'자동 처리 시작',exact:true}).click();await expect(dialog.getByRole('button',{name:mode==='local'?'로컬 전경 후보 찾기':'자동 처리 시작',exact:true})).toBeEnabled();
 const candidates=await dialog.locator('.region-row').count();
 if(!candidates){await expect(dialog.getByRole('button',{name:'검토한 레이어 생성',exact:true})).toBeDisabled();expect(expected.accepted).toBe(0);await dialog.screenshot({path:path.join(dir,'preserved.png')});fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({candidates,editableImages:0,status:'source preserved; segmentation failed'}));return;}
 await dialog.getByLabel(/선택 영역이 단색 배경/).check();await dialog.getByRole('button',{name:'결과 미리보기',exact:true}).click();await expect(dialog.getByAltText('레이어 변환 결과')).toBeVisible();
 await dialog.getByRole('button',{name:'검토한 레이어 생성',exact:true}).click();const project=await saved(page),p=project.pages[1];const images=p.elements.filter(e=>e.type==='image'&&!e.locked);expect(images.length).toBe(expected.accepted);
 const output=async(label:string,name:string)=>{await page.getByRole('button',{name:'내보내기',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const file=path.join(dir,name);await(await pending).saveAs(file);return file;};
 await output('PNG · 현재 페이지','before.png');
 if(images.length){const e=images[0];await page.getByTestId('layer-image').filter({has:page.getByLabel(`${e.id} 숨김`,{exact:true})}).locator('.layer-name').click();await page.getByLabel('요소 X',{exact:true}).fill('780');await page.getByLabel('요소 X',{exact:true}).blur();await output('PNG · 현재 페이지','moved.png');await page.getByRole('button',{name:'요소 삭제',exact:true}).click();}
 const edited=await saved(page);await output('PNG · 현재 페이지','deleted.png');const zip=await output('프로젝트 ZIP · 편집 원본','edited.studio.zip');
 const context=await browser.newContext(),fresh=await context.newPage();await boot(fresh);await fresh.getByTestId('archive-upload').setInputFiles(zip);await expect(fresh.getByText('레이어와 원본 에셋을 복원했습니다.',{exact:true})).toBeVisible();const restored=await saved(fresh);expect(restored.pages).toEqual(edited.pages);expect(restored.assets).toEqual(edited.assets);await context.close();
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({candidates,editableImages:images.length,moveDelete:images.length>0,zipRestored:true,semanticRecognition:false}));
});
