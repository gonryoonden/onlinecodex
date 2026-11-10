"use client";
import { useState } from 'react';
import type { Project } from '@/lib/project';
import { betaDiagnosticZip,readBetaEvents,type BetaEvent } from '@/lib/beta-diagnostics';
import { download } from '@/lib/archive';
export default function ProblemDialog({getProject,onClose}:{getProject:()=>Project;onClose:()=>void}){
 const [include,setInclude]=useState(false),[reported,setReported]=useState<BetaEvent['code']>('unknown'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="modal-backdrop"><section className="library-dialog" role="dialog" aria-modal="true" aria-label="로컬 문제 진단" onKeyDown={e=>e.stopPropagation()}>
 <header className="dialog-header"><h2>로컬 문제 진단</h2><button onClick={onClose} disabled={busy}>닫기</button></header>
 <div className="table-dialog-body"><p>최근 {readBetaEvents().length}개 작업 기록을 이 브라우저에 보관합니다. 진단 ZIP은 기기에 저장되며 자동 제출되지 않습니다.</p>
 <label>문제 종류<select aria-label="문제 종류" value={reported} onChange={e=>setReported(e.target.value as BetaEvent['code'])}><option value="unknown">분석·편집·출력 오류</option><option value="empty">객체 누락</option><option value="mask-risk">경계·배경 보정 문제</option><option value="quota">저장 공간·호출 한도</option></select></label>
 <label><input type="checkbox" checked={include} onChange={e=>setInclude(e.target.checked)}/>현재 프로젝트의 이미지·본문도 진단 ZIP에 포함</label>
 <p>기본 기록에는 이미지·본문·프로젝트 이름·서버 오류 원문·API 키가 없습니다. 프로젝트를 포함하면 원본 이미지와 문구가 함께 저장되므로 제출 전에 확인하세요.</p>
 {error&&<p role="alert">{error}</p>}</div><footer className="dialog-footer"><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{let p:Project|undefined;try{p=getProject();}catch{if(include)throw new Error('현재 프로젝트를 읽지 못했습니다. 프로젝트 첨부를 해제해 진단 기록만 저장하세요.');}download(await betaDiagnosticZip(p,include,reported),'studio-beta-diagnostic.zip');}catch(e){setError(e instanceof Error?e.message:'진단 저장 실패');}finally{setBusy(false);}}}>진단 ZIP 저장</button></footer>
 </section></div>;
}
