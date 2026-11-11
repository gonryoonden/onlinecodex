import fs from 'node:fs';
import {chromium} from '@playwright/test';
const record=JSON.parse(fs.readFileSync(process.env.STUDIO_PREVIEW_ACCESS_FILE,'utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto(record.url,{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('button',{name:'텍스트 추가',exact:true}).waitFor({timeout:60000});
 await context.storageState({path:process.env.STUDIO_PREVIEW_STORAGE});fs.chmodSync(process.env.STUDIO_PREVIEW_STORAGE,0o600);
 console.log('Protected Preview authenticated using connector temporary access; browser state saved privately.');
}catch{console.error('Protected Preview browser authentication failed; no credentials logged.');process.exitCode=1;}
finally{await browser.close();}
