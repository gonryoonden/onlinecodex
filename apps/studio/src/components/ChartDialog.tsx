'use client';
import { useState } from 'react';
import { verifiedTableSeries } from '@/lib/bar-chart';
import { createBarChartElement,type BarChartElement,type TableElement } from '@/lib/types';
export default function ChartDialog({table,onClose,onApply}:{table:TableElement;onClose:()=>void;onApply:(chart:BarChartElement)=>void}){
 const [confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 let series:ReturnType<typeof verifiedTableSeries>|undefined,problem='';try{series=verifiedTableSeries(table);}catch(e){problem=e instanceof Error?e.message:'변환 불가';}
 return <div className="modal-backdrop"><section className="library-dialog" role="dialog" aria-modal="true" aria-label="차트 데이터 검토"><header className="dialog-header"><h2>막대 차트 데이터 검토</h2><button onClick={onClose}>닫기</button></header><div className="table-dialog-body">
 <p>검토한 숫자 한 계열을 편집 가능한 막대 차트로 만듭니다. 원본 표는 보존하고 새 페이지를 추가합니다.</p>
 {series&&<><strong>{series.seriesName}</strong><ul>{series.data.map((d,i)=><li key={i}>{d.label}: {d.value}</li>)}</ul><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>표의 항목·숫자·단위가 정확함을 확인했습니다.</label></>}
 {(problem||error)&&<p className="warning" role="alert">{problem||error}</p>}
 </div><footer className="dialog-footer"><button disabled={!series||!confirmed} onClick={()=>{if(!series||!confirmed)return;try{onApply(createBarChartElement({...series,name:'검토한 막대 차트'}));onClose();}catch(e){setError(e instanceof Error?e.message:'차트 생성 실패');}}}>검토한 차트 생성</button></footer></section></div>;
}
