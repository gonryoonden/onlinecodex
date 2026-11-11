import { toPixels, type Region } from "./schema";
import type { TraceItem } from "./diagnostics";
type Rect = [number,number,number,number];
export interface LocalPatch { id:string; rect:Rect; color:[number,number,number] }
const contains=(a:Rect,b:Rect)=>a[0]<b[0]-2&&a[1]<b[1]-2&&a[0]+a[2]>b[0]+b[2]+2&&a[1]+a[3]>b[1]+b[3]+2;
const intersects=(a:Rect,b:Rect)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
/** Conservative local flat-fill, NOT semantic segmentation or hidden-background recovery.
 * All tests use source pixels; fill is restricted to reviewed boxes. Unknown/overlapping
 * backgrounds stay raster. Ring statistics are a heuristic and require visual review. */
export function planLocalReplacement(data: Uint8ClampedArray, width:number,height:number,regions:Region[],skip:string[],reviewed:boolean|'automatic') {
  const accepted:Region[]=[], patches:LocalPatch[]=[], retained:TraceItem[]=[];
  const rects=regions.map(r=>{const [x,y,w,h]=toPixels(r.bbox,width,height);return [Math.floor(x),Math.floor(y),Math.ceil(x+w)-Math.floor(x),Math.ceil(y+h)-Math.floor(y)] as Rect;});
  regions.forEach((r,index)=>{
    const rect=rects[index], [x,y,w,h]=rect;
    let reason:TraceItem["reason"];
    if(skip.includes(r.id))reason="user-excluded";
    else if(reviewed!==true&&reviewed!=='automatic'&&!r.manualBackground)reason="unreviewed";
    else if(rects.some((b,i)=>i!==index&&intersects([x-2,y-2,w+4,h+4],b)&&!(regions[i].type==="shape"&&regions[i].zIndex<r.zIndex&&contains(b,rect))))reason="overlap";
    else if(x<0||y<0||x+w>width||y+h>height||(!r.manualBackground&&(x<3||y<3||x+w>width-3||y+h>height-3||w*h>width*height*.2)))reason="large-or-edge";
    if(reason){retained.push({id:r.id,type:r.type,reason});return;}
    if(r.manualBackground){
      const color=r.manualBackground.color.slice(1).match(/../g)!.map(c=>parseInt(c,16)) as [number,number,number];
      accepted.push(r);patches.push({id:r.id,rect,color});return;
    }
    const samples:number[][]=[];
    // Complete 2 px outer ring: no downsampling can miss a thin border.
    for(let yy=y-2;yy<y+h+2;yy++)for(let xx=x-2;xx<x+w+2;xx++) {
      if(xx>=x&&xx<x+w&&yy>=y&&yy<y+h)continue;
      const p=(yy*width+xx)*4;samples.push([data[p],data[p+1],data[p+2],data[p+3]]);
    }
    const color=[0,1,2].map(c=>samples.map(p=>p[c]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]) as [number,number,number];
    const bad=samples.filter(p=>p[3]<255||p.slice(0,3).some((v,c)=>Math.abs(v-color[c])>10)).length;
    if(!samples.length||bad/samples.length>.01){retained.push({id:r.id,type:r.type,reason:"complex-boundary"});return;}
    accepted.push(r);patches.push({id:r.id,rect,color});
  });
  return {accepted,patches,retained};
}
export function applyLocalPatches(data:Uint8ClampedArray,width:number,patches:LocalPatch[]) {
  const result=new Uint8ClampedArray(data);
  for(const {rect:[x,y,w,h],color} of patches)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
    const i=(yy*width+xx)*4;result[i]=color[0];result[i+1]=color[1];result[i+2]=color[2];result[i+3]=255;
  }
  return result;
}
