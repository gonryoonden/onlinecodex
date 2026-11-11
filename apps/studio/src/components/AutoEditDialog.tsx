'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {Asset} from '@/lib/project';
import type {Diagnostic} from '@/lib/magic-layers/diagnostics';
import type {PageData} from '@/lib/types';
import {automaticEdit,cachedAnalysis,sourceKey,type SavedAnalysis} from '@/lib/magic-layers/automatic';
export default function AutoEditDialog({source,width,height,saved,persist,onApply,onClose,onAdvanced}:{source:Asset;width:number;height:number;saved?:SavedAnalysis;persist:(v:SavedAnalysis)=>void;onApply:(p:PageData,a:Asset[],s:Asset,d:Diagnostic)=>void;onClose:()=>void;onAdvanced:()=>void}){
 const [consent,setConsent]=useState(false),[status,setStatus]=useState('저장된 분석 확인 중'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [available,setAvailable]=useState<SavedAnalysis|undefined>(saved);
 const initialSaved=useRef(saved);
 const [requiresConsent]=useState(()=>!saved);
 const running=useRef<AbortController|null>(null),callbacks=useRef({persist,onApply,onClose});
 useEffect(()=>{callbacks.current={persist,onApply,onClose};},[persist,onApply,onClose]);
 const execute=useCallback(async(v?:SavedAnalysis,allow=false)=>{
  if(running.current)return;const controller=new AbortController();running.current=controller;setBusy(true);setError('');
  const timeout=setTimeout(()=>controller.abort(),240000);
  try{const result=await automaticEdit({source,width,height,consent:allow,saved:v,signal:controller.signal,progress:setStatus,persist:value=>{setAvailable(value);callbacks.current.persist(value);}});controller.signal.throwIfAborted();callbacks.current.onApply(result.page,result.assets,source,result.diagnostic);callbacks.current.onClose();}
  catch(e){setError(controller.signal.aborted?'처리를 취소했거나 시간 한도에 도달했습니다. 원본과 완료된 분석은 보존됩니다.':e instanceof Error?e.message:'자동 처리 실패');}
  finally{clearTimeout(timeout);if(running.current===controller)running.current=null;setBusy(false);}
 },[source,width,height]);
 useEffect(()=>{
  let active=true;void sourceKey(source).then(key=>{if(!active)return;const v=initialSaved.current??cachedAnalysis(key);if(v){setAvailable(v);void execute(v);}else setStatus('이 이미지의 외부 전송 동의가 필요합니다.');});
  return()=>{active=false;running.current?.abort();};
 },[source,execute]);
 return <div className="modal-backdrop"><section className="magic-dialog" role="dialog" aria-modal="true" aria-label="자동 편집 준비"><header className="dialog-header"><h2>이미지에서 편집 레이어로</h2><button disabled={busy} onClick={onClose}>닫기</button></header><div className="magic-body"><div>
 <p>텍스트·도형·이미지를 자동 처리하고, 문제가 있는 후보만 상세 검토에 남깁니다.</p><p>기기 분리 모델은 최초 약 57MB를 다운로드합니다. 이미지 분리는 이 기기에서 실행합니다.</p>
 {requiresConsent&&<label><input type="checkbox" disabled={busy||Boolean(available)} checked={consent} onChange={e=>{setConsent(e.target.checked);if(e.target.checked)void execute(undefined,true);}}/>외부 Gemini API로 이 이미지 전송에 동의하고 자동 편집을 시작합니다.</label>}
 <p role="status" aria-label="자동 편집 진행">{status}</p>{error&&<p role="alert">{error}</p>}
 {busy?<button onClick={()=>running.current?.abort()}>자동 처리 취소</button>:<>{error&&<button onClick={()=>void execute(available,consent)}>자동 처리 재시도</button>}<button onClick={onAdvanced}>고급 수동 교정</button></>}
 </div></div></section></div>;
}
