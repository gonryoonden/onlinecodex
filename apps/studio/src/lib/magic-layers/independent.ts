import { createImageElement, uid, type PageData } from '../types';
import type { Asset } from '../project';
import { fitSource } from '../image-layout';
import type { Analysis } from './schema';
import { restoreCandidateBackground } from './restoration';
import { extractAlphaCandidates } from './extraction';
import { reconcileCandidates } from './candidates';
import { elementItems, snapshotStage, type Diagnostic } from './diagnostics';
export interface Reconstruction { page:PageData; assets:Asset[]; warnings:string[]; diagnostic:Diagnostic; }
/** Extraction is an independent transaction. A missing repair never drops native candidates.
 * Until a repair is approved, candidates are hidden to avoid duplicating source ink. */
export async function reconstructIndependent(input:Analysis,source:Asset,width:number,height:number,skip:string[],provider:string,
 generate:(input:Analysis)=>Promise<Reconstruction>,initial:Partial<Diagnostic>={},reviewed=false) :Promise<Reconstruction> {
 const {canonical,outcomes}=reconcileCandidates(input.regions,skip);
 const extractable=await extractAlphaCandidates(source,canonical,outcomes);
 const generated=extractable.length?await generate({...input,background:{...input.background,kind:'solid'},regions:extractable}):undefined;
 const elements=generated?.page.elements??[];
 for(const el of elements){
  const o=outcomes.find(o=>o.id===el.provenance?.regionId)!;o.elementId=el.id;
  if(el.type==='image')el.provenance!.method=`${provider}:${o.maskOrigin??"analysis"}:${o.extraction}`;
  el.visible=false;el.name='배경 보정 대기 · '+(el.name??el.type);el.provenance!.backgroundWarning=true;
 }
 // Extraction is committed to inventory before repair. Repair failures leave these elements intact.
 let restored:{dataUrl:string;repaired:number}|undefined;
 let repairFailed=false;
 try {restored=await restoreCandidateBackground(source,[...canonical,...input.regions.filter(r=>skip.includes(r.id))],skip,elements,outcomes,reviewed);}
 catch {repairFailed=true;}
 const backgroundAsset:Asset|undefined=restored?.repaired?{...source,id:uid('asset'),name:'독립 레이어 국소 복원 배경 · 검토 필요',dataUrl:restored.dataUrl,mime:'image/png',original:false}:undefined;
 const fit=fitSource(source.width,source.height,width,height);
 elements.unshift(createImageElement(backgroundAsset?.dataUrl??source.dataUrl,source.width,source.height,{x:fit.x,y:fit.y,width:fit.width,height:fit.height,radius:0,assetId:backgroundAsset?.id??source.id,locked:true,name:backgroundAsset?.name??'원본 보존 · 배경 보정 필요',provenance:{source:source.id,method:'independent-pending-background',review:true,backgroundWarning:true}}));
 const omitted=outcomes.filter(o=>!o.elementId).map(o=>({id:o.id,type:o.type,reason:o.status==='merged'?'duplicate' as const:o.status==='user-excluded'?'user-excluded' as const:'separation-failed' as const}));
 const diagnostic:Diagnostic={version:1,runId:initial.runId??uid('run'),sourceId:source.id,createdAt:new Date().toISOString(),provider,
  inputKind:initial.inputKind??'unknown',mode:'independent',status:restored?.repaired?'partial-editable':'review-required',background:restored?.repaired?'local-patches':'original',candidates:outcomes,
  stages:[...(initial.stages??[]),snapshotStage('reviewed',input.regions),snapshotStage('reconstructed',elementItems(elements),omitted)],warnings:[...(outcomes.some(o=>o.status==='correction-needed'||o.status==='separation-failed')?['BACKGROUND_PENDING']:[]),'INDEPENDENT_APPROXIMATION',...(repairFailed?['BACKGROUND_REPAIR_FAILED']:[])]};
 return {page:{...generated?.page,magicReview:{sourceId:source.id,analysis:input,skip,provider},id:generated?.page.id??uid('page'),background:{type:'solid',color:input.background.from},elements},assets:[...(generated?.assets??[]),...(backgroundAsset?[backgroundAsset]:[])],warnings:['독립 후보를 보존했습니다. 숨김 후보는 준비 완료 개수에 포함하지 않습니다. 국소 단색 복원은 근사이며 질감·그림자와 경계를 검토하세요.'],diagnostic};
}
