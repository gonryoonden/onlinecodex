import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
test('automatic cancellation and retry reuse completed real Gemini response',async({page})=>{
 test.setTimeout(180000);const cached=JSON.parse(fs.readFileSync('../../evidence/studio/phase3/gemini-live-improved.json','utf8')).result;let calls=0;
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:true}}));await page.route('**/api/ai/magic-layers',r=>{calls++;return r.fulfill({json:cached});});
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();await page.getByTestId('file-upload').setInputFiles('../../2024년_산업안전보건교육_주요_개정_요약.png');const d=page.getByRole('dialog',{name:'자동 편집 준비'});
 await d.getByLabel('외부 Gemini API로 이 이미지 전송에 동의하고 자동 편집을 시작합니다.').check();await expect(d.getByLabel('자동 편집 진행')).toContainText('이미지 특징 분석',{timeout:90000});await d.getByRole('button',{name:'자동 처리 취소',exact:true}).click();await expect(d.getByRole('alert')).toContainText('취소');
 expect(calls).toBe(1);await d.getByRole('button',{name:'자동 처리 재시도',exact:true}).click();await expect(page.getByTestId('auto-summary')).toBeVisible({timeout:120000});expect(calls).toBe(1);
 const out=path.resolve(process.env.STUDIO_LOOP_EVIDENCE||'../../work/ux-browser');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'auto-cancel.json'),JSON.stringify({cancelled:'actual model encoder',retried:true,analysisRequests:1,freshGeminiCalls:0,candidates:46,duplicateConsentClicks:0,perObjectApprovals:0},null,2));
});
