import JSZip from 'jszip';
import { z } from 'zod';
import type { Project } from './project';
import { projectZip } from './archive';
export const BETA_VERSION='personal-magic-beta-2026-11-09';
const eventSchema=z.object({
 at:z.string().datetime(),feature:z.enum(['upload','analysis','preview','background','correction','storage','export']),
 stage:z.enum(['input','profile','ai','local','legacy','review','apply','save','restore','output']),
 outcome:z.enum(['ok','error','cancelled','fallback','review']),
 code:z.enum(['none','cancelled','quota','network','invalid','unknown','empty','manual-protected','mask-risk','source-preserved']),
 count:z.number().int().min(0).max(500).optional(),
 method:z.enum(['gemini','adaptive','legacy','manual','original','zip','png','pdf','pptx','other']).optional(),
 correction:z.enum(['text','bbox','polygon','alpha','other']).optional(),
});
export type BetaEvent=z.infer<typeof eventSchema>;
const key='studio-beta-diagnostics-v1';
export function readBetaEvents():BetaEvent[]{
 try{return z.array(eventSchema).max(80).parse(JSON.parse(localStorage.getItem(key)||'[]'));}catch{return [];}
}
export function recordBetaEvent(event:Omit<BetaEvent,'at'>){
 try{const safe=eventSchema.parse({...event,at:new Date().toISOString()});localStorage.setItem(key,JSON.stringify([...readBetaEvents(),safe].slice(-80)));}catch{/* A diagnostic failure never blocks editing. */}
}
export function errorCode(error:unknown):BetaEvent['code']{
 if(error instanceof Error){if(error.name==='AbortError')return 'cancelled';if(error.name==='QuotaExceededError')return 'quota';if(error instanceof TypeError)return 'network';}
 return 'unknown';
}
export async function betaDiagnosticZip(project:Project|undefined,includeProject:boolean,reported:BetaEvent['code']='unknown'){
 const zip=new JSZip(),events=readBetaEvents();
 const ua=typeof navigator==='undefined'?'':navigator.userAgent;
 const browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chromium':/Safari\//.test(ua)?'Safari':/Firefox\//.test(ua)?'Firefox':'other';
 const summary=project?{pages:project.pages.length,width:project.width,height:project.height,objects:project.pages.map(p=>({total:p.elements.length,text:p.elements.filter(e=>e.type==='text').length,images:p.elements.filter(e=>e.type==='image').length,locked:p.elements.filter(e=>e.locked).length}))}:null;
 zip.file('diagnostics.json',JSON.stringify({format:'studio-beta-diagnostic-1',version:BETA_VERSION,browser,viewport:typeof window!=='undefined'&&window.innerWidth<600?'mobile':'desktop',reported,summary,events,includesProject:includeProject},null,2));
 zip.file('REPRODUCE.md','# 로컬 문제 진단\n\n앱 버전·작업 단계·오류 분류만 기본 포함합니다. 서버 응답 원문/이미지/본문/프로젝트 이름/URL/키를 기록하지 않습니다.\n\n1. diagnostics.json의 마지막 실패 단계와 처리 방법 확인\n2. 프로젝트가 별도 포함된 경우 비공개 로컬 환경에서 ZIP 열기\n3. 해당 기능 실행 → 원본/결과 비교 → 관련 회귀 테스트\n4. 재현되지 않으면 실제 조작 순서를 사용자에게 확인\n\n프로젝트 포함 여부는 사용자가 선택했습니다. 포함된 이미지/본문은 제출 전에 확인하고 공개 저장소에 올리지 마세요. 이전 정상 상태는 앱의 복구본 기능에서 별도로 확인합니다.\n');
 if(includeProject){if(!project)throw new Error('첨부할 프로젝트가 없습니다.');zip.file('project.studio.zip',await(await projectZip(project)).arrayBuffer());}
 return new Blob([new Uint8Array(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})).buffer],{type:'application/zip'});
}
