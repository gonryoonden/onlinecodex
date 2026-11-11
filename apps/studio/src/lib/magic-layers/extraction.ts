import { loadImage } from '../imports';
import type { Asset } from '../project';
import { toPixels, type Region } from './schema';
import { flatBackgroundMask } from './local-detect';
import { maskHealth } from './adaptive';
import type { CandidateOutcome } from './candidates';
/** Structural alpha validation; never certifies semantic object identity. */
export function polygonCoverage(region:Region) {
 const p=region.polygon;if(!p)return 0;
 let area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-a[1]*b[0];}
 return Math.abs(area)/2/(region.bbox[2]*region.bbox[3]);
}
export async function extractAlphaCandidates(source:Asset,regions:Region[],outcomes:CandidateOutcome[]) {
 const result:Region[]=[];let original:HTMLImageElement|undefined;
 for(const r of regions){
  const o=outcomes.find(o=>o.id===r.id)!;
  if(r.type!=='image'){o.extraction='native';result.push(r);continue;}
  try{
   if(r.polygon){
    const coverage=polygonCoverage(r);
    if(coverage<.005||coverage>.98)throw new Error('polygon-empty-or-opaque');
    o.extraction='polygon';o.maskOrigin=r.maskOrigin??'analysis';result.push(r);continue;
   }
   if(r.maskPng){
    const mask=await loadImage(r.maskPng);
    if(mask.naturalWidth*mask.naturalHeight>4194304)throw new Error('mask-too-large');
    const c=document.createElement('canvas');c.width=Math.min(256,mask.naturalWidth);c.height=Math.min(256,mask.naturalHeight);
    const ctx=c.getContext('2d')!;ctx.drawImage(mask,0,0,c.width,c.height);const data=ctx.getImageData(0,0,c.width,c.height).data;
    const values=new Uint8Array(c.width*c.height);for(let i=0;i<values.length;i++)values[i]=Math.round(data[i*4]*data[i*4+3]/255);
    if(maskHealth(values,c.width,c.height).reject)throw new Error('mask-empty-or-opaque');
    o.extraction='model-mask';o.maskOrigin=r.maskOrigin??'analysis';result.push(r);continue;
   }
   original??=await loadImage(source.dataUrl);
   const [x,y,w,h]=toPixels(r.bbox,source.width,source.height);
   const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));
   if(c.width*c.height>4194304)throw new Error('local-mask-too-large');
   const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(original,x,y,w,h,0,0,c.width,c.height);
   const pixels=ctx.getImageData(0,0,c.width,c.height),values=flatBackgroundMask(pixels.data,c.width,c.height);
   if(!values)throw new Error('ambiguous-background-use-polygon-or-alpha-brush');
   for(let i=0;i<values.length;i++){pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=values[i];pixels.data[i*4+3]=255;}
   ctx.putImageData(pixels,0,0);
   const candidate={...r,maskPng:c.toDataURL('image/png')};
   if(candidate.maskPng.length>2*1024*1024)throw new Error('local-mask-too-large');
   o.extraction='flat-key';o.maskOrigin='local';result.push(candidate);
  }catch(e){o.status='separation-failed';o.reason=e instanceof Error?e.message:'alpha-extraction-failed';}
 }
 return result;
}
