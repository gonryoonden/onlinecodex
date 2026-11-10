"use client";
import { useEffect, useRef, useState } from 'react';
import type { Asset } from '@/lib/project';
import { loadImage } from '@/lib/imports';
import { paintAlpha } from '@/lib/magic-layers/alpha-brush';

export default function MaskEditor({current,base,onClose,onApply}:{current:Asset;base:Asset;onClose:()=>void;onApply:(dataUrl:string)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),dialog=useRef<HTMLElement>(null);
 const state=useRef<{pixels:ImageData;alpha:Uint8Array;base:Uint8Array;history:Uint8Array[]}|null>(null);
 const pointer=useRef<{id:number;last:[number,number]}|null>(null);
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[radius,setRadius]=useState(12),[restore,setRestore]=useState(false),[steps,setSteps]=useState(0),[backdrop,setBackdrop]=useState('#b6c5d0');
 const redraw=()=>{const s=state.current,c=canvas.current;if(!s||!c)return;for(let i=0;i<s.alpha.length;i++)s.pixels.data[i*4+3]=s.alpha[i];c.getContext('2d')!.putImageData(s.pixels,0,0);};
 useEffect(()=>{
  let active=true;
  void (async()=>{
   if(base.width*base.height>4_000_000)throw new Error('경계 브러시는 4MP 이하 레이어를 지원합니다. 원본은 유지됩니다.');
   const [original,edited]=await Promise.all([loadImage(base.dataUrl),loadImage(current.dataUrl)]);if(!active)return;
   if(original.naturalWidth*original.naturalHeight>4_000_000||original.naturalWidth!==base.width||original.naturalHeight!==base.height)throw new Error('경계 원본의 실제 크기가 지원 범위 또는 저장 정보와 다릅니다.');
   if(original.naturalWidth!==edited.naturalWidth||original.naturalHeight!==edited.naturalHeight)throw new Error('경계 원본과 현재 이미지 크기가 다릅니다.');
   const c=canvas.current!;c.width=original.naturalWidth;c.height=original.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true})!;
   x.drawImage(edited,0,0);const data=x.getImageData(0,0,c.width,c.height),alpha=new Uint8Array(c.width*c.height);
   for(let i=0;i<alpha.length;i++)alpha[i]=data.data[i*4+3];
   x.clearRect(0,0,c.width,c.height);x.drawImage(original,0,0);const pixels=x.getImageData(0,0,c.width,c.height),initial=new Uint8Array(alpha.length);
   for(let i=0;i<alpha.length;i++){initial[i]=pixels.data[i*4+3];alpha[i]=Math.min(alpha[i],initial[i]);pixels.data[i*4+3]=alpha[i];}
   state.current={pixels,alpha,base:initial,history:[]};x.putImageData(pixels,0,0);setReady(true);dialog.current?.focus();
  })().catch(e=>{if(active)setError(e instanceof Error?e.message:'경계 이미지 열기 실패');});
  return()=>{active=false;state.current=null;};
 },[base,current]);
 const undo=()=>{const s=state.current,previous=s?.history.pop();if(s&&previous){s.alpha=previous;setSteps(s.history.length);redraw();}};
 const point=(e:React.PointerEvent<HTMLCanvasElement>):[number,number]=>{const r=e.currentTarget.getBoundingClientRect();return [(e.clientX-r.left)*e.currentTarget.width/r.width,(e.clientY-r.top)*e.currentTarget.height/r.height];};
 const stroke=(to:[number,number])=>{const s=state.current,p=pointer.current;if(!s||!p)return;paintAlpha(s.alpha,s.base,canvas.current!.width,canvas.current!.height,p.last,to,radius,restore);p.last=to;redraw();};
 return <div className="modal-backdrop"><section ref={dialog} tabIndex={-1} className="library-dialog" role="dialog" aria-modal="true" aria-label="이미지 경계 보정" onKeyDown={e=>{
  e.stopPropagation();if(e.key==='Escape')onClose();
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s')e.preventDefault();
  if(e.key==='Tab'){const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}>
  <header className="dialog-header"><h2>이미지 경계 보정</h2><button onClick={onClose}>취소</button></header>
  <div className="table-dialog-body">
   <p>브러시로 가장자리의 불필요한 픽셀을 지우세요. 복원은 최초 보정 전 이미지의 픽셀까지만 가능합니다. 누락된 부분 추가 분리와 배경 복원은 별도 작업입니다.</p>
   <div className="button-row"><button disabled={!ready} aria-pressed={!restore} onClick={()=>setRestore(false)}>경계 지우기</button><button disabled={!ready} aria-pressed={restore} onClick={()=>setRestore(true)}>경계 복원</button><button disabled={!steps} onClick={undo}>브러시 되돌리기</button></div>
   <div className="field-grid"><label>브러시 반경 (원본 px)<input aria-label="브러시 반경" type="range" min="1" max="100" value={radius} onChange={e=>setRadius(Number(e.target.value))}/>{radius}px</label><label>검토 배경<select aria-label="경계 검토 배경" value={backdrop} onChange={e=>setBackdrop(e.target.value)}><option value="#b6c5d0">회청색</option><option value="#ffffff">흰색</option><option value="#202a35">어두운색</option></select></label></div>
   {!ready&&!error&&<p role="status">원본 경계를 불러오는 중…</p>}
   <canvas ref={canvas} aria-label="경계 브러시 캔버스" style={{display:'block',maxWidth:'100%',maxHeight:'55vh',width:'auto',height:'auto',background:backdrop,touchAction:'none',cursor:'crosshair'}}
    onPointerDown={e=>{if(!ready||e.button!==0)return;e.preventDefault();const s=state.current!;s.history.push(s.alpha.slice());if(s.history.length>8)s.history.shift();setSteps(s.history.length);const p=point(e);pointer.current={id:e.pointerId,last:p};e.currentTarget.setPointerCapture(e.pointerId);stroke(p);}}
    onPointerMove={e=>{if(pointer.current?.id===e.pointerId)stroke(point(e));}}
    onPointerUp={e=>{if(pointer.current?.id===e.pointerId){stroke(point(e));pointer.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}}
    onLostPointerCapture={()=>{pointer.current=null;}} onPointerCancel={()=>{pointer.current=null;}}/>
   <p className="muted">최근 8개 브러시 작업을 되돌릴 수 있습니다. 적용 후에는 편집기의 되돌리기를 사용하세요.</p>
   {error&&<p role="alert" className="warning">{error}</p>}
  </div>
  <footer className="dialog-footer"><button disabled={!ready} onClick={()=>{try{const s=state.current!;if(!s.alpha.some(v=>v>0))throw new Error('이미지가 모두 투명합니다. 객체 삭제는 편집기의 삭제 기능을 사용하세요.');onApply(canvas.current!.toDataURL('image/png'));onClose();}catch(e){setError(e instanceof Error?e.message:'경계 적용 실패');}}}>경계 보정 적용</button></footer>
 </section></div>;
}
