import { test,expect,type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
const root=path.resolve(process.env.STUDIO_P3_EVIDENCE||'../../evidence/studio/p3');
async function output(page:Page,label:string,name:string){await page.getByRole('button',{name:'내보내기',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();await(await pending).saveAs(path.join(root,name));}
test('ruled grid proposes geometry only; verified cells edit, restore and export as native table',async({page,browser})=>{
 fs.mkdirSync(root,{recursive:true});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let apiCalls=0;
 await page.route('**/api/ai/**',r=>{apiCalls++;return r.abort();});
 await page.goto('/');await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();
 const image=await page.evaluate(async()=>{await document.fonts.load('400 20px "Noto Sans KR"','한글');const c=document.createElement('canvas');c.width=500;c.height=320;const x=c.getContext('2d')!;x.fillStyle='#ffffff';x.fillRect(0,0,500,320);x.strokeStyle='#222222';x.lineWidth=2;
  for(const yy of [40,120,200,280]){x.beginPath();x.moveTo(40,yy);x.lineTo(440,yy);x.stroke();}for(const xx of [40,200,440]){x.beginPath();x.moveTo(xx,40);x.lineTo(xx,280);x.stroke();}
  x.font='20px "Noto Sans KR"';x.fillStyle='#222222';['과정','인원','교육 A','1250','교육 B','80'].forEach((v,i)=>x.fillText(v,i%2?220:55,90+Math.floor(i/2)*80));return c.toDataURL();});
 fs.writeFileSync(path.join(root,'table-source.png'),Buffer.from(image.split(',')[1],'base64'));
 await page.getByTestId('file-upload').setInputFiles({name:'한글 표.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
 await page.getByRole('button',{name:'이미지에서 표 구조 찾기',exact:true}).click();const d=page.getByRole('dialog',{name:'표 구조 검토'});
 await d.getByRole('button',{name:'단순 표 격자 찾기',exact:true}).click();await expect(d.getByText(/3행 × 2열 후보/)).toBeVisible();
 await expect(d.getByLabel('검토한 표 데이터')).toHaveValue('');await expect(d.getByRole('button',{name:'검토한 표를 새 페이지로 생성'})).toBeDisabled();
 await d.getByLabel('검토한 표 데이터').fill('과정\t인원\n교육 A\t1250\n교육 B\t80');await d.getByLabel('행·열과 모든 글자·숫자를 원본과 대조했습니다.').check();
 await d.getByRole('button',{name:'검토한 표를 새 페이지로 생성',exact:true}).click();await expect(page.getByTestId('layer-table')).toHaveCount(1);
 await page.getByTestId('layer-table').locator('.layer-name').click();await expect(page.getByLabel('요소 회전',{exact:true})).toBeEnabled();
 await page.getByLabel('표 3행 2열',{exact:true}).fill('90');await page.getByLabel('요소 X',{exact:true}).fill('70');await page.getByLabel('요소 너비',{exact:true}).fill('750');
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'페이지 2',exact:true}).click();await page.getByTestId('layer-table').locator('.layer-name').click();await expect(page.getByLabel('표 3행 2열',{exact:true})).toHaveValue('90');
 await output(page,'PNG · 현재 페이지','table-edited.png');await output(page,'PDF · 모든 페이지','table-edited.pdf');await output(page,'PPTX · 편집 가능한 객체 (실험)','table-edited.pptx');await output(page,'프로젝트 ZIP · 편집 원본','table.studio.zip');
 const zip=await JSZip.loadAsync(fs.readFileSync(path.join(root,'table-edited.pptx')));const xml=await zip.file('ppt/slides/slide2.xml')!.async('string');
 expect(xml).toContain('<a:tbl>');expect(xml.match(/<a:tc>/g)).toHaveLength(6);expect(xml).toContain('교육 A');expect(xml).toContain('<a:t xml:space="preserve">90</a:t>');expect(xml).not.toContain('<p:pic>');
 await page.screenshot({path:path.join(root,'table-desktop.png')});
 const context=await browser.newContext();const second=await context.newPage();await second.goto('/');await second.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor();await second.getByTestId('archive-upload').setInputFiles(path.join(root,'table.studio.zip'));
 await expect(second.getByText('레이어와 원본 에셋을 복원했습니다.',{exact:true})).toBeVisible();await second.getByRole('button',{name:'페이지 2',exact:true}).click();await second.getByTestId('layer-table').locator('.layer-name').click();await expect(second.getByLabel('표 3행 2열',{exact:true})).toHaveValue('90');await context.close();
 await page.getByLabel('표 3행 2열',{exact:true}).fill('80%');await page.getByRole('button',{name:'이 표로 막대 차트 만들기'}).click();
 const chartDialog=page.getByRole('dialog',{name:'차트 데이터 검토'});await expect(chartDialog.getByRole('alert')).toContainText('추정하지 않습니다');await expect(chartDialog.getByRole('button',{name:'검토한 차트 생성'})).toBeDisabled();await page.keyboard.press('Delete');await chartDialog.getByRole('button',{name:'닫기',exact:true}).click();
 await expect(page.getByTestId('layer-table')).toHaveCount(1);await page.getByLabel('표 3행 2열',{exact:true}).fill('90');await page.getByRole('button',{name:'이 표로 막대 차트 만들기'}).click();
 await chartDialog.getByLabel('표의 항목·숫자·단위가 정확함을 확인했습니다.').check();await chartDialog.getByRole('button',{name:'검토한 차트 생성'}).click();
 await page.getByTestId('layer-chart').locator('.layer-name').click();await page.getByLabel('차트 값 2',{exact:true}).fill('100');
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();
 await output(page,'PNG · 현재 페이지','chart-edited.png');await output(page,'PPTX · 편집 가능한 객체 (실험)','chart-edited.pptx');await output(page,'프로젝트 ZIP · 편집 원본','chart.studio.zip');
 const chartZip=await JSZip.loadAsync(fs.readFileSync(path.join(root,'chart-edited.pptx')));expect(await chartZip.file('ppt/charts/chart-3-2.xml')!.async('string')).toContain('<c:v>100</c:v>');
 await page.reload();await page.getByRole('button',{name:'페이지 3',exact:true}).click();await page.getByTestId('layer-chart').locator('.layer-name').click();await expect(page.getByLabel('차트 값 2',{exact:true})).toHaveValue('100');
 await page.screenshot({path:path.join(root,'chart-desktop.png')});
 expect(apiCalls).toBe(0);expect(errors).toEqual([]);
});

test('mobile 390px: table cell editing, local save, reload and usable panel controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'도구 패널',exact:true}).click();
 await page.getByRole('button',{name:'빈 표 추가',exact:true}).click();await page.getByRole('button',{name:'레이어 패널',exact:true}).click();
 await page.getByLabel('표 2행 1열',{exact:true}).fill('모바일 한글');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('이 브라우저에 저장됨',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'캔버스 보기',exact:true}).click();await expect(page.getByTestId('artboard')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 fs.mkdirSync(root,{recursive:true});await page.screenshot({path:path.join(root,'mobile-canvas.png')});await page.reload();
 await page.getByRole('button',{name:'레이어 패널',exact:true}).click();await page.getByTestId('layer-table').locator('.layer-name').click();await expect(page.getByLabel('표 2행 1열',{exact:true})).toHaveValue('모바일 한글');
 await page.screenshot({path:path.join(root,'mobile-table-edit.png')});
});
