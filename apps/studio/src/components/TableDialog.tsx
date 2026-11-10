'use client';
import { useState } from 'react';
import type { Asset } from '@/lib/project';
import { createPage,createTableElement,type PageData } from '@/lib/types';
import { fitSource } from '@/lib/image-layout';
import { detectTableInAsset,confirmedCells,type TableGrid } from '@/lib/table-grid';
export default function TableDialog({source,width,height,onClose,onApply}:{source:Asset;width:number;height:number;onClose:()=>void;onApply:(p:PageData)=>void}){
 const [grid,setGrid]=useState<TableGrid|null>(null),[text,setText]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function detect(){setBusy(true);setError('');setGrid(null);setConfirmed(false);try{await new Promise(r=>setTimeout(r,0));const g=await detectTableInAsset(source);setGrid(g);if(!g)setError('지원하는 단순 격자를 찾지 못했습니다. 원본을 유지합니다. 병합 셀·불균일 행·옅은 선은 지원하지 않습니다.');}catch(e){setError(e instanceof Error?e.message:'탐지 실패');}finally{setBusy(false);}}
 function apply(){if(!grid||!confirmed)return;try{
  const cells=confirmedCells(text,grid.rows,grid.cols),fit=fitSource(source.width,source.height,width,height),p=createPage();
  p.elements=[createTableElement({name:'검토한 표',rows:grid.rows,cols:grid.cols,cells,colWidths:grid.colWidths.map(v=>v*fit.scale),x:fit.x+grid.x*fit.scale,y:fit.y+grid.y*fit.scale,width:grid.width*fit.scale,height:grid.height*fit.scale,fontFamily:'Noto Sans KR',fontSize:Math.max(8,Math.min(24,grid.height/grid.rows*fit.scale*.35)),provenance:{source:source.id,method:'ruled-grid:user-confirmed-cells',review:true}})];
  onApply(p);onClose();
 }catch(e){setError(e instanceof Error?e.message:'표 생성 실패');}}
 return <div className="modal-backdrop"><section className="library-dialog" role="dialog" aria-modal="true" aria-label="표 구조 검토">
  <header className="dialog-header"><h2>표 구조 검토</h2><button aria-label="표 검토 닫기" onClick={onClose} disabled={busy}>닫기</button></header>
  <div className="table-dialog-body">
   <p>어두운 직선 격자만 탐지합니다. 글자·숫자는 추정하지 않습니다. 원본과 대조한 셀을 새 페이지에 만들며, 원본 페이지는 보존합니다.</p>
   <div className="table-source"><img src={source.dataUrl} alt="표 검토 원본"/>{grid&&<div aria-label="탐지한 표 영역" style={{position:'absolute',border:'3px solid #e07030',left:`${grid.x/source.width*100}%`,top:`${grid.y/source.height*100}%`,width:`${grid.width/source.width*100}%`,height:`${grid.height/source.height*100}%`,pointerEvents:'none'}}/>}</div>
   <button onClick={()=>void detect()} disabled={busy}>{busy?'격자를 확인하는 중…':'단순 표 격자 찾기'}</button>
   {grid&&<><p>{grid.rows}행 × {grid.cols}열 후보 · 병합 셀이나 누락된 선이 없는지 확인하세요.</p><label>검토한 셀 데이터 (탭 구분)<textarea aria-label="검토한 표 데이터" value={text} onChange={e=>{setText(e.target.value);setConfirmed(false);}} placeholder="스프레드시트에서 셀을 복사해 붙여넣으세요."/></label>
   <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>행·열과 모든 글자·숫자를 원본과 대조했습니다.</label></>}
   {error&&<p role="alert" className="warning">{error}</p>}
  </div><footer className="dialog-footer"><button onClick={apply} disabled={!grid||!confirmed||busy}>검토한 표를 새 페이지로 생성</button></footer>
 </section></div>;
}
