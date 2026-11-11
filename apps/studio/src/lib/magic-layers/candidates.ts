import type { Region } from './schema';
export type CandidateStatus = 'generated' | 'merged' | 'correction-needed' | 'separation-failed' | 'user-excluded';
export interface CandidateOutcome {
 id: string; type: Region['type']; status: CandidateStatus; canonicalId?: string;
 parentId?: string; elementId?: string; reason?: string;
 extraction?: 'native' | 'polygon' | 'model-mask' | 'flat-key';
 background: 'pending' | 'local-flat' | 'manual-flat' | 'inpaint-review';
}
function intersection(a:Region,b:Region) {
 return Math.max(0,Math.min(a.bbox[0]+a.bbox[2],b.bbox[0]+b.bbox[2])-Math.max(a.bbox[0],b.bbox[0]))*
 Math.max(0,Math.min(a.bbox[1]+a.bbox[3],b.bbox[1]+b.bbox[3])-Math.max(a.bbox[1],b.bbox[1]));
}
export function reconcileCandidates(regions:Region[],skip:string[]) {
 const canonical:Region[]=[],outcomes:CandidateOutcome[]=[];
 for(const r of regions){
  if(skip.includes(r.id)){outcomes.push({id:r.id,type:r.type,status:'user-excluded',background:'pending'});continue;}
  const duplicate=canonical.find(c=>{
   if(c.type!==r.type)return false;
   if(r.type==='text'&&c.text?.replace(/\s/g,'')!==r.text?.replace(/\s/g,''))return false;
   if(r.type==='shape'&&(c.shape!==r.shape||c.style?.color!==r.style?.color))return false;
   const overlap=intersection(c,r);return overlap/(c.bbox[2]*c.bbox[3]+r.bbox[2]*r.bbox[3]-overlap)>=.9;
  });
  if(duplicate){outcomes.push({id:r.id,type:r.type,status:'merged',canonicalId:duplicate.id,background:'pending'});continue;}
  canonical.push(r);outcomes.push({id:r.id,type:r.type,status:'correction-needed',reason:'background-pending',background:'pending'});
 }
 for(const r of canonical){
  const parent=canonical.filter(p=>p.type==='shape'&&p.zIndex<r.zIndex&&p.bbox[2]*p.bbox[3]>r.bbox[2]*r.bbox[3]&&intersection(p,r)>=r.bbox[2]*r.bbox[3]-.001).sort((a,b)=>a.bbox[2]*a.bbox[3]-b.bbox[2]*b.bbox[3])[0];
  if(parent)outcomes.find(o=>o.id===r.id)!.parentId=parent.id;
 }
 return {canonical,outcomes};
}
