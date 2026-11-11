import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
test('REAL cached Gemini candidates survive model cancellation and a subsequent retry',async({page})=>{
 test.setTimeout(240000);const cached=JSON.parse(fs.readFileSync('../../evidence/studio/phase3/gemini-live-improved.json','utf8')).result;
 await page.route('**/api/capabilities',r=>r.fulfill({json:{enabled:true,model:'cached-REAL-NOT-fresh-call'}}));await page.route('**/api/ai/magic-layers',r=>r.fulfill({json:cached}));
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();await page.getByTestId('file-upload').setInputFiles('../../2024년_산업안전보건교육_주요_개정_요약.png');await page.getByRole('button',{name:'분석·영역 교정 열기',exact:true}).click();const d=page.getByRole('dialog');
 await d.getByLabel('외부 Gemini API로 이미지 전송에 동의합니다.').check();await d.getByRole('button',{name:'AI 레이어 분해',exact:true}).click();await expect(d.locator('.region-row')).toHaveCount(46);
 await d.getByRole('button',{name:'AI 객체 투명 분리 · 기기에서 실행',exact:true}).click();await expect(d.getByLabel('기기 분할 상태')).toContainText('이미지 특징 분석',{timeout:120000});await d.getByRole('button',{name:'자동 처리 취소',exact:true}).click();await expect(d.getByRole('alert')).toContainText('취소');await expect(d.locator('.region-row')).toHaveCount(46);
 await expect(d.getByRole('button',{name:'AI 객체 투명 분리 · 기기에서 실행',exact:true})).toBeEnabled();
 await d.getByRole('button',{name:'AI 객체 투명 분리 · 기기에서 실행',exact:true}).click();await expect(d.getByLabel('기기 분할 상태')).toContainText('모델 마스크 26개',{timeout:180000});await expect(d.locator('.region-row')).toHaveCount(46);
 const out=path.resolve(process.env.STUDIO_LOOP_EVIDENCE||'../../work/loop-browser');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'sam-recovery.json'),JSON.stringify({source:'stored REAL Gemini 46 candidates',cancelledAt:'encoder',candidatesBefore:46,candidatesAfterCancellation:46,retryModelMasks:26,manualMasks:0,passed:true},null,2));
});
