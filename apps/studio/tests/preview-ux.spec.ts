import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const evidence=path.resolve(process.env.STUDIO_UX_EVIDENCE||'../../evidence/studio/preview-ux');
fs.mkdirSync(evidence,{recursive:true});
for(const [width,height] of [[1920,1080],[1366,768],[390,844]])test(`upload layout and zoom ${width}`,async({page})=>{
 await page.setViewportSize({width,height});await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:true,model:'test',candidates:['test']}}));await page.goto('/');await page.getByRole('button',{name:'이미지로 시작',exact:true}).waitFor();
 const url=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d')!;x.fillStyle='white';x.fillRect(0,0,600,400);x.fillStyle='blue';x.fillRect(100,100,200,200);return c.toDataURL();});
 await page.getByTestId('file-upload').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(url.split(',')[1],'base64')});
 const banner=page.locator('.studio-banner');expect((await banner.boundingBox())!.height).toBeLessThan(110);const v=await page.getByTestId('canvas-viewport').boundingBox();expect(v!.height).toBeGreaterThan(height*.42);expect(v!.y).toBeLessThan(250);
 await page.getByRole('button',{name:'확대',exact:true}).click();await page.getByRole('button',{name:'작업영역에 맞춤',exact:true}).click();
 await page.screenshot({path:path.join(evidence,`layout-${width}.png`)});
 await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();const d=page.getByRole('dialog');await expect(d.getByRole('button',{name:'AI 레이어 분해',exact:true})).toBeVisible();await expect(d.getByLabel('무료 분석 모델')).not.toBeVisible();
 await page.route('**/api/ai/**',r=>r.fulfill({status:429,json:{error:'quota'}}));await d.getByLabel('외부 Gemini API로 이미지 전송에 동의합니다.').check();await d.getByRole('button',{name:'AI 레이어 분해',exact:true}).click();await expect(d.getByRole('alert')).toContainText('호출 한도 초과');
});
for(const status of [403,503])test(`capability failure is explicit ${status}`,async({page})=>{
 await page.route('**/api/capabilities',r=>r.fulfill({status,json:{error:'configuration unavailable'}}));await page.goto('/');await page.getByTestId('file-upload').setInputFiles('../../tests/studio/fixtures/diamond.png');await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText(status===403?'인증 오류':'configuration unavailable');
});
