import { loadImage } from "../imports";
import { uid } from "../types";
import type { Asset } from "../project";
import type { Region } from "./schema";
/** Pixel candidates, not semantic object recognition. No network or model weights. */
export function componentBoxes(data:Uint8ClampedArray,width:number,height:number, strategy: "legacy" | "adaptive" = "adaptive") {
  const marked=new Uint8Array(width*height),seen=new Uint8Array(width*height),boxes:number[][]=[],components:number[][]=[];
  let adaptiveUsed=false;
  for(let i=0;i<marked.length;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);marked[i]=data[i*4+3]>200&&(hi<110||hi-lo>55)?1:0;}
  // A uniform saturated/dark background used to become one giant component,
  // while neutral light icons were never marked. Only use a background-relative
  // threshold when the full perimeter agrees and foreground occupancy is sparse.
  // This proposes pixel regions, not semantic labels or hidden-background truth.
  if (strategy === "adaptive") {
    const border:number[][]=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<2||y<2||x>=width-2||y>=height-2)
      border.push(Array.from(data.subarray((y*width+x)*4,(y*width+x)*4+4)));
    const bg=[0,1,2].map(c=>border.map(p=>p[c]).sort((a,b)=>a-b)[Math.floor(border.length/2)]);
    const flat=border.length>0&&border.every(p=>p[3]===255)&&border.filter(p=>bg.some((v,c)=>Math.abs(v-p[c])>6)).length/border.length<=.01;
    if(flat){
      const relative=new Uint8Array(width*height);let count=0;
      for(let i=0;i<relative.length;i++)if(data[i*4+3]>200&&bg.some((v,c)=>Math.abs(data[i*4+c]-v)>12)){relative[i]=1;count++;}
      if(count/relative.length<=.35){marked.set(relative);adaptiveUsed=true;}
    }
  }
  const queue=new Int32Array(width*height);
  for(let i=0;i<marked.length;i++){
    if(!marked[i]||seen[i])continue;
    let first=0,last=1,minX=i%width,maxX=minX,minY=Math.floor(i/width),maxY=minY;queue[0]=i;seen[i]=1;
    while(first<last){const p=queue[first++],x=p%width,y=Math.floor(p/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      // Three-pixel connectivity joins thin antialiased outline gaps. Still a composite candidate, not semantic recognition.
      for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const n=yy*width+xx;if(marked[n]&&!seen[n]){seen[n]=1;queue[last++]=n;}}
    }
    const w=maxX-minX+1,h=maxY-minY+1;
    if(w>=4&&h>=4)components.push([minX,minY,maxX+1,maxY+1]);
    if(w>=18&&h>=18&&w/h<2.7&&h/w<2.7&&w*h<width*height*.045&&last>80)
      boxes.push([Math.max(0,minX-5),Math.max(0,minY-5),Math.min(width,maxX+6),Math.min(height,maxY+6)]);
  }
  // Newly visible pale/white words must not become icon layers merely because
  // their connected glyphs form a compact box. Nearby aligned components are a
  // conservative text-line hint, not OCR. Leave those pixels in the source.
  return boxes.filter(box=>!adaptiveUsed||!components.some(c=>{
    const [l,t,r,b]=box.map((v,i)=>v+(i<2?5:-5)),h=b-t,ch=c[3]-c[1];
    const gap=Math.max(c[0]-r,l-c[2]);
    return gap>=0&&gap<h*.6&&ch>=h*.6&&ch<=h*1.5&&Math.min(b,c[3])-Math.max(t,c[1])>Math.min(h,ch)*.65;
  })).slice(0,40);
}
/** Conservative binary alpha on a verified flat perimeter. Keep even faint gray
 * source pixels (P1's distance>30 removed chart arcs). RGB is never recolored.
 * This is background keying, not an estimated semantic/soft segmentation mask. */
export function flatBackgroundMask(data:Uint8ClampedArray,w:number,h:number):Uint8Array|null {
  if(w<5||h<5||data.length!==w*h*4)return null;
  const border:number[][]=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<2||y<2||x>=w-2||y>=h-2){const i=(y*w+x)*4;border.push([data[i],data[i+1],data[i+2],data[i+3]]);}
  const bg=[0,1,2].map(c=>border.map(v=>v[c]).sort((a,b)=>a-b)[Math.floor(border.length/2)]);
  // Estimate weak compression/near-flat noise from the perimeter. Large variation
  // still rejects the candidate; raising a universal cutoff would erase faint ink.
  const noise=border.map(p=>Math.max(...p.slice(0,3).map((v,c)=>Math.abs(v-bg[c])))).sort((a,b)=>a-b);
  const tolerance=Math.max(3,noise[Math.floor((noise.length-1)*.995)]);
  if(border.some(p=>p[3]!==255)||tolerance>10)return null;
  const mask=new Uint8Array(w*h);let count=0;
  for(let i=0;i<mask.length;i++){
    const distance=Math.max(...bg.map((v,c)=>Math.abs(data[i*4+c]-v)));
    mask[i]=distance>tolerance?data[i*4+3]:0;
    if(mask[i])count++;
  }
  return count<w*h*.04||count>w*h*.8?null:mask;
}
export async function detectLocalImages(source:Asset,existing:Region[],signal?:AbortSignal,onProgress?:(n:number)=>void,strategy:'adaptive'|'legacy'='adaptive'):Promise<Region[]> {
  if(source.width*source.height>16_000_000)throw new Error("로컬 후보 탐지는 16MP 이하 이미지를 지원합니다. 원본은 유지됩니다.");
  const img=await loadImage(source.dataUrl),scale=Math.min(1,640/Math.max(source.width,source.height));
  const cv=document.createElement("canvas");cv.width=Math.round(source.width*scale);cv.height=Math.round(source.height*scale);
  const ctx=cv.getContext("2d",{willReadFrequently:true})!;ctx.drawImage(img,0,0,cv.width,cv.height);
  const boxes=componentBoxes(ctx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height,strategy),result:Region[]=[];
  for(const [index,box] of boxes.entries()){
    signal?.throwIfAborted();onProgress?.(Math.round(index/Math.max(1,boxes.length)*100));await new Promise(r=>setTimeout(r,0));
    const [x,y,right,bottom]=box.map((v,i)=>Math.round(v/(i%2?cv.height:cv.width)*(i%2?source.height:source.width)));
    const w=right-x,h=bottom-y,bbox:[number,number,number,number]=[x/source.width*1000,y/source.height*1000,w/source.width*1000,h/source.height*1000];
    if(existing.some(r=>{const a=r.bbox;return Math.max(0,Math.min(a[0]+a[2],bbox[0]+bbox[2])-Math.max(a[0],bbox[0]))*Math.max(0,Math.min(a[1]+a[3],bbox[1]+bbox[3])-Math.max(a[1],bbox[1]))>bbox[2]*bbox[3]*.1;}))continue;
    const mask=document.createElement("canvas");mask.width=w;mask.height=h;const mc=mask.getContext("2d",{willReadFrequently:true})!;mc.drawImage(img,x,y,w,h,0,0,w,h);const pixels=mc.getImageData(0,0,w,h);
    const values=flatBackgroundMask(pixels.data,w,h);
    if(!values)continue;
    for(let i=0;i<values.length;i++){pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=values[i];pixels.data[i*4+3]=255;}
    mc.putImageData(pixels,0,0);result.push({id:uid("local"),type:"image",bbox,maskPng:mask.toDataURL("image/png"),zIndex:existing.length+result.length,review:true});
    if(existing.length+result.length>=80)break;
  }
  signal?.throwIfAborted();onProgress?.(100);return result;
}
