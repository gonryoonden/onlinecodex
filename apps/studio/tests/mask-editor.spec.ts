import { test,expect,type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import JSZip from 'jszip';
import { projectZip } from '../src/lib/archive';
import { newProject,type Project } from '../src/lib/project';
import { createImageElement } from '../src/lib/types';
const root=process.env.STUDIO_MASK_EVIDENCE;
async function boot(p:Page){await p.route('**/api/capabilities',r=>r.fulfill({json:{enabled:false,reason:'offline'}}));await p.goto('/');await p.getByRole('button',{name:'저장',exact:true}).waitFor();}
async function saved(page:Page):Promise<Project>{await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();return page.evaluate(()=>new Promise<Project>(resolve=>{const r=indexedDB.open('personal-magic-studio');r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>{resolve(q.result.sort((a:Project,b:Project)=>b.updatedAt.localeCompare(a.updatedAt))[0]);db.close();};};}));}
async function alpha(url:string){const {data,info}=await sharp(Buffer.from(url.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {value:data[(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4+3],data,info};}
for(const mobile of [false,true])test(`mask brush keeps source, undo, ZIP and later restoration (${mobile?'mobile':'desktop'})`,async({page,browser})=>{
 if(mobile)await page.setViewportSize({width:390,height:844});
 await boot(page);const p=newProject('경계 보정 검증',600,400);
 const png=await sharp({create:{width:120,height:100,channels:4,background:{r:45,g:110,b:150,alpha:1}}}).png().toBuffer();
 p.assets.original={id:'original',name:'opaque test icon',width:120,height:100,mime:'image/png',original:true,dataUrl:`data:image/png;base64,${png.toString('base64')}`};
 p.pages[0].elements=[createImageElement(p.assets.original.dataUrl,120,100,{assetId:'original',x:180,y:140,width:120,height:100,rotation:17,opacity:.8})];
 const input=Buffer.from(await(await projectZip(p)).arrayBuffer());await page.getByTestId('archive-upload').setInputFiles({name:'mask.studio.zip',mimeType:'application/zip',buffer:input});
 if(mobile)await page.getByRole('button',{name:'레이어 패널',exact:true}).click();
 await page.getByTestId('layer-image').locator('.layer-name').click();
 await page.getByRole('button',{name:'이미지 경계 보정',exact:true}).click();const dialog=page.getByRole('dialog',{name:'이미지 경계 보정'});
 const c=dialog.getByLabel('경계 브러시 캔버스');await expect(dialog.getByRole('button',{name:'경계 지우기',exact:true})).toBeEnabled();
 const box=(await c.boundingBox())!;await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 // Cancel leaves current pixels unchanged.
 await dialog.getByRole('button',{name:'취소',exact:true}).click();expect((await saved(page)).pages[0].elements[0].assetId).toBe('original');
 await page.getByRole('button',{name:'이미지 경계 보정',exact:true}).click();await expect(dialog.getByRole('button',{name:'경계 지우기',exact:true})).toBeEnabled();
 const b=(await c.boundingBox())!;await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
 await dialog.getByRole('button',{name:'브러시 되돌리기',exact:true}).click();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
 await dialog.getByRole('button',{name:'경계 보정 적용',exact:true}).click();
 const edited=await saved(page),el=edited.pages[0].elements[0];expect((await alpha(edited.assets[el.assetId!].dataUrl)).value).toBe(0);expect(el.rotation).toBe(17);expect(el.opacity).toBe(.8);expect(el.provenance?.alphaEdit?.baseAssetId).toBe('original');expect(edited.assets.original).toEqual(p.assets.original);
 await page.getByRole('button',{name:'되돌리기',exact:true}).click();expect((await saved(page)).pages[0].elements[0].assetId).toBe('original');
 await page.getByRole('button',{name:'다시 실행',exact:true}).click();expect((await saved(page)).pages[0].elements[0].assetId).toBe(el.assetId);
 const output=async(label:string,file:string)=>{await page.getByRole('button',{name:'내보내기',exact:true}).click();const wait=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const d=await wait,target=root?path.join(root,file):test.info().outputPath(file);if(root)fs.mkdirSync(root,{recursive:true});await d.saveAs(target);return target;};
 const zip=await output('프로젝트 ZIP · 편집 원본',`mask-${mobile}.studio.zip`);
 if(!mobile){await page.getByRole('button',{name:'내보내기',exact:true}).click();await page.getByLabel('출력 해상도').selectOption('2');await page.getByRole('button',{name:'내보내기',exact:true}).click();const image=await output('PNG · 현재 페이지','mask.png');const pptx=await output('PPTX 다운로드 — 발표용','mask.pptx');const z=await JSZip.loadAsync(fs.readFileSync(pptx));expect(Buffer.from(await z.file('ppt/media/page-1.png')!.async('uint8array'))).toEqual(fs.readFileSync(image));await output('PDF · 모든 페이지','mask.pdf');}
 const context=await browser.newContext(),fresh=await context.newPage();await boot(fresh);await fresh.getByTestId('archive-upload').setInputFiles(zip);await expect(fresh.getByText('레이어와 원본 에셋을 복원했습니다.',{exact:true})).toBeVisible();const restored=await saved(fresh);expect(restored.pages).toEqual(edited.pages);expect(restored.assets).toEqual(edited.assets);
 await fresh.getByTestId('layer-image').locator('.layer-name').click();await fresh.getByRole('button',{name:'이미지 경계 보정',exact:true}).click();const rd=fresh.getByRole('dialog',{name:'이미지 경계 보정'});await expect(rd.getByRole('button',{name:'경계 복원',exact:true})).toBeEnabled();await rd.getByRole('button',{name:'경계 복원',exact:true}).click();const rb=(await rd.getByLabel('경계 브러시 캔버스').boundingBox())!;await fresh.mouse.click(rb.x+rb.width/2,rb.y+rb.height/2);await rd.getByRole('button',{name:'경계 보정 적용',exact:true}).click();const recovered=await saved(fresh);expect((await alpha(recovered.assets[recovered.pages[0].elements[0].assetId!].dataUrl)).value).toBe(255);
 if(root&&!mobile)await fresh.screenshot({path:path.join(root,'mask-restored.png')});await context.close();
});
