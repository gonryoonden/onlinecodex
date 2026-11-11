import { loadImage } from '../imports';
import type { Asset } from '../project';
import type { AnyElement } from '../types';
import type { Region } from './schema';
import type { CandidateOutcome } from './candidates';
import { planLocalReplacement, type LocalPatch } from './preservation';
/** A repair writes only its measured rectangle, or extracted alpha support for images.
 * Filling support entirely (not blending original ink back) prevents original ghost pixels. */
export function writeRepair(data:Uint8ClampedArray,width:number,height:number,patch:LocalPatch,
 support?:{alpha:Uint8Array;x:number;y:number;width:number;height:number}) {
 const [l,t,w,h]=patch.rect;
 for(let y=Math.max(0,t);y<Math.min(height,t+h);y++)for(let x=Math.max(0,l);x<Math.min(width,l+w);x++){
  if(support){const xx=x-support.x,yy=y-support.y;if(xx<0||yy<0||xx>=support.width||yy>=support.height||!support.alpha[yy*support.width+xx])continue;}
  const p=(y*width+x)*4;data[p]=patch.color[0];data[p+1]=patch.color[1];data[p+2]=patch.color[2];data[p+3]=255;
 }
}
export async function restoreCandidateBackground(source:Asset,regions:Region[],skip:string[],elements:AnyElement[],outcomes:CandidateOutcome[],reviewed:boolean) {
 const image=await loadImage(source.dataUrl),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas 사용 불가');ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,source.width,source.height),plan=planLocalReplacement(pixels.data,source.width,source.height,regions,skip,reviewed);
 let repaired=0;
 for(const el of elements){
  const o=outcomes.find(o=>o.id===el.provenance?.regionId)!;
  const patch=plan.patches.find(p=>p.id===o.id);
  if(!patch){o.reason=plan.retained.find(r=>r.id===o.id)?.reason??'background-pending';continue;}
  try{
   if(el.type==='image'&&!regions.find(r=>r.id===o.id)?.manualBackground){
    const crop=await loadImage(el.src),c=document.createElement('canvas');c.width=crop.naturalWidth;c.height=crop.naturalHeight;
    const cx=c.getContext('2d')!;cx.drawImage(crop,0,0);const data=cx.getImageData(0,0,c.width,c.height).data,alpha=new Uint8Array(c.width*c.height);
    for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3];
    const rect=el.provenance!.sourcePixels!;
    writeRepair(pixels.data,source.width,source.height,patch,{alpha,x:rect[0],y:rect[1],width:c.width,height:c.height});
   }else writeRepair(pixels.data,source.width,source.height,patch);
   repaired++;el.visible=true;el.name=el.name?.replace('배경 보정 대기 · ','');
   o.status='generated';o.background=regions.find(r=>r.id===o.id)?.manualBackground?'manual-flat':'local-flat';o.reason=undefined;
  }catch{o.reason='repair-failed-candidate-preserved';}
 }
 ctx.putImageData(pixels,0,0);
 return {dataUrl:canvas.toDataURL('image/png'),repaired};
}
