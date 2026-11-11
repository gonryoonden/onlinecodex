import { createImageElement, uid, type PageData } from '../types';
import type { Asset } from '../project';
import { fitSource } from '../image-layout';
import type { Analysis } from './schema';
import { extractAlphaCandidates } from './extraction';
import { reconcileCandidates } from './candidates';
import { elementItems, snapshotStage, type Diagnostic } from './diagnostics';
export interface Reconstruction { page:PageData; assets:Asset[]; warnings:string[]; diagnostic:Diagnostic; }
/** Extraction is an independent transaction. A missing repair never drops native candidates.
 * Until a repair is approved, candidates are hidden to avoid duplicating source ink. */
export async function reconstructIndependent(input:Analysis,source:Asset,width:number,height:number,skip:string[],provider:string,
 generate:(input:Analysis)=>Promise<Reconstruction>,initial:Partial<Diagnostic>={}) :Promise<Reconstruction> {
 const {canonical,outcomes}=reconcileCandidates(input.regions,skip);
 const extractable=await extractAlphaCandidates(source,canonical,outcomes);
 const generated=extractable.length?await generate({...input,background:{...input.background,kind:'solid'},regions:extractable}):undefined;
 const elements=generated?.page.elements??[];
 for(const el of elements){
  const o=outcomes.find(o=>o.id===el.provenance?.regionId)!;o.elementId=el.id;
  el.visible=false;el.name='배경 보정 대기 · '+(el.name??el.type);el.provenance!.backgroundWarning=true;
 }
 const fit=fitSource(source.width,source.height,width,height);
 elements.unshift(createImageElement(source.dataUrl,source.width,source.height,{x:fit.x,y:fit.y,width:fit.width,height:fit.height,radius:0,assetId:source.id,locked:true,name:'원본 보존 · 배경 보정 필요',provenance:{source:source.id,method:'independent-pending-background',review:true,backgroundWarning:true}}));
 const omitted=outcomes.filter(o=>!o.elementId).map(o=>({id:o.id,type:o.type,reason:o.status==='merged'?'duplicate' as const:o.status==='user-excluded'?'user-excluded' as const:'separation-failed' as const}));
 const diagnostic:Diagnostic={version:1,runId:initial.runId??uid('run'),sourceId:source.id,createdAt:new Date().toISOString(),provider,
  inputKind:initial.inputKind??'unknown',mode:'independent',status:'review-required',background:'original',candidates:outcomes,
  stages:[...(initial.stages??[]),snapshotStage('reviewed',input.regions),snapshotStage('reconstructed',elementItems(elements),omitted)],warnings:['BACKGROUND_PENDING']};
 return {page:{...generated?.page,id:generated?.page.id??uid('page'),background:{type:'solid',color:input.background.from},elements},assets:generated?.assets??[],warnings:['독립 후보는 보존했습니다. 배경 보정 전 후보는 숨김 상태이며 편집 준비 완료 개수에 포함하지 않습니다.'],diagnostic};
}
