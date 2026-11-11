import {loadImage} from '../imports';
import type {Asset} from '../project';
import type {Region} from './schema';
import {bilinear,imageSize,upsampleLogits} from './sam-math';
interface Mask {id:string;score:number;logits:Float32Array;}
export async function segmentObjects(source:Asset,regions:Region[],signal:AbortSignal,progress:(message:string)=>void){
 const targets=regions.filter(r=>r.type==='image'&&!r.polygon&&!r.maskPng);if(!targets.length)throw new Error('마스크가 없는 이미지 후보가 없습니다.');
 if(typeof Worker==='undefined'||typeof WebAssembly==='undefined')throw new Error('이 브라우저는 기기 분할을 지원하지 않습니다. 영역을 수동 교정하세요.');
 signal.throwIfAborted();const image=await loadImage(source.dataUrl),size=imageSize(source.width,source.height);
 const c=document.createElement('canvas');c.width=size.width;c.height=size.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0,c.width,c.height);
 const pixels=ctx.getImageData(0,0,c.width,c.height).data,input=new Float32Array(3*1024*1024),mean=[123.675,116.28,103.53],std=[58.395,57.12,57.375];
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)for(let k=0;k<3;k++)input[k*1048576+y*1024+x]=(pixels[(y*c.width+x)*4+k]-mean[k])/std[k];
 const boxes=targets.map(r=>({id:r.id,coords:[r.bbox[0]*size.width/1000,r.bbox[1]*size.height/1000,(r.bbox[0]+r.bbox[2])*size.width/1000,(r.bbox[1]+r.bbox[3])*size.height/1000]}));
 const worker=new Worker(new URL('./segment.worker.ts',import.meta.url),{type:'module'}),masks:Mask[]=[];
 const info=await new Promise<{revision:string;elapsedMs:number}>((resolve,reject)=>{
  const abort=()=>{worker.terminate();reject(new DOMException('분할 취소','AbortError'));};signal.addEventListener('abort',abort,{once:true});
  const cleanup=()=>signal.removeEventListener('abort',abort);
  worker.onerror=()=>{cleanup();worker.terminate();reject(new Error('기기 분할 실행 실패. 원본과 기존 교정은 유지됩니다.'));};
  worker.onmessage=e=>{const m=e.data;if(m.stage==='error'){cleanup();worker.terminate();reject(new Error(m.message));}
   else if(m.stage==='done'){cleanup();worker.terminate();resolve(m);}
   else if(m.stage==='mask'){masks.push(m);progress(`객체 마스크 ${m.completed}/${m.total}`);}
   else progress(m.stage==='download'?'기기 분할 모델 준비 · 최초 약 57MB 다운로드':'이미지 특징 분석 중 · 원본은 전송하지 않습니다.');};
  if(signal.aborted){abort();cleanup();return;}worker.postMessage({data:input,boxes},[input.buffer]);
 });
 const changes=new Map<string,Region>();let rejected=0;
 for(const m of masks){
  signal.throwIfAborted();const target=targets.find(r=>r.id===m.id)!,full=upsampleLogits(m.logits),[x,y,w,h]=target.bbox.map((v,i)=>v*(i%2?size.height:size.width)/1000);
  let left=1024,top=1024,right=0,bottom=0,area=0,inside=0;
  for(let yy=0;yy<size.height;yy++)for(let xx=0;xx<size.width;xx++)if(full[yy*1024+xx]>0){area++;if(xx>=x&&xx<x+w&&yy>=y&&yy<y+h)inside++;left=Math.min(left,xx);top=Math.min(top,yy);right=Math.max(right,xx+1);bottom=Math.max(bottom,yy+1);}
  const coverage=inside/Math.max(1,w*h),spill=(area-inside)/Math.max(1,area);
  if(!area||m.score<.8||coverage<.02||coverage>.99||spill>.15){rejected++;continue;}
  const l=Math.max(0,Math.floor(left/size.width*source.width)-3),t=Math.max(0,Math.floor(top/size.height*source.height)-3),r=Math.min(source.width,Math.ceil(right/size.width*source.width)+3),b=Math.min(source.height,Math.ceil(bottom/size.height*source.height)+3);
  if((r-l)*(b-t)>4194304){rejected++;continue;}
  const mask=document.createElement('canvas');mask.width=r-l;mask.height=b-t;const mc=mask.getContext('2d')!,data=mc.createImageData(mask.width,mask.height);
  for(let yy=0;yy<mask.height;yy++)for(let xx=0;xx<mask.width;xx++){
   const sx=(l+xx+.5)*size.width/source.width-.5,sy=(t+yy+.5)*size.height/source.height-.5;
   const value=bilinear(full,1024,1024,Math.min(size.width-1,sx),Math.min(size.height-1,sy))>0?255:0,p=(yy*mask.width+xx)*4;
   data.data[p]=data.data[p+1]=data.data[p+2]=value;data.data[p+3]=255;
  }
  mc.putImageData(data,0,0);const maskPng=mask.toDataURL('image/png');if(maskPng.length>2*1024*1024){rejected++;continue;}
  changes.set(m.id,{...target,bbox:[l/source.width*1000,t/source.height*1000,(r-l)/source.width*1000,(b-t)/source.height*1000],maskPng,maskOrigin:'segmenter',review:true,segmentation:{model:'MobileSAM-vit_t',revision:info.revision,score:m.score,promptBox:target.bbox}});
 }
 return {regions:regions.map(r=>changes.get(r.id)??r),accepted:changes.size,rejected,elapsedMs:info.elapsedMs};
}
