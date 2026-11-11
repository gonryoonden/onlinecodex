/** Bounded directional inpainting. Uses known boundary pixels, never original masked ink.
 * Reconstructs smooth color/gradient approximately; it cannot recover hidden texture. */
export interface Support {alpha:Uint8Array;x:number;y:number;width:number;height:number;}
export function inpaintSupport(data:Uint8ClampedArray,width:number,height:number,support:Support,protectedRects:number[][],radius:number,verifySmooth=false){
 const l=Math.max(0,support.x-radius-1),t=Math.max(0,support.y-radius-1),right=Math.min(width,support.x+support.width+radius+1),bottom=Math.min(height,support.y+support.height+radius+1),w=right-l,h=bottom-t;
 if(w*h>500000||w*h>width*height*.2)throw new Error('inpaint-area-limit');
 const initial=new Uint8Array(w*h);
 for(let y=0;y<support.height;y++)for(let x=0;x<support.width;x++)if(support.alpha[y*support.width+x]){const xx=support.x+x-l,yy=support.y+y-t;if(xx>=0&&xx<w&&yy>=0&&yy<h)initial[yy*w+xx]=1;}
 const horizontal=new Uint8Array(w*h),mask=new Uint8Array(w*h);
 for(let y=0;y<h;y++){let count=0;for(let x=-radius;x<w;x++){const add=x+radius;if(add>=0&&add<w)count+=initial[y*w+add];const remove=x-radius-1;if(remove>=0)count-=initial[y*w+remove];if(x>=0)horizontal[y*w+x]=count?1:0;}}
 for(let x=0;x<w;x++){let count=0;for(let y=-radius;y<h;y++){const add=y+radius;if(add>=0&&add<h)count+=horizontal[add*w+x];const remove=y-radius-1;if(remove>=0)count-=horizontal[remove*w+x];if(y>=0)mask[y*w+x]=count?1:0;}}
 let count=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){
  count++;const xx=l+x,yy=t+y;
  if(xx<1||yy<1||xx>=width-1||yy>=height-1)throw new Error('inpaint-source-edge');
  if(protectedRects.some(([px,py,pw,ph])=>xx>=px&&xx<px+pw&&yy>=py&&yy<py+ph))throw new Error('inpaint-neighbor-conflict');
 }
 if(!count)throw new Error('inpaint-empty');
 const disagreement:number[]=[];
 const sum=new Float32Array(w*h*3),weight=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(!mask[y*w+x])continue;const start=x;while(x<w&&mask[y*w+x])x++;const end=x;
  if(start===0||end===w)throw new Error('inpaint-boundary-missing');
  for(let xx=start;xx<end;xx++){const f=(xx-start+1)/(end-start+1),p=y*w+xx,a=((t+y)*width+l+start-1)*4,b=((t+y)*width+l+end)*4;for(let k=0;k<3;k++)sum[p*3+k]=data[a+k]*(1-f)+data[b+k]*f;weight[p]++;}
 }
 for(let x=0;x<w;x++)for(let y=0;y<h;y++){
  if(!mask[y*w+x])continue;const start=y;while(y<h&&mask[y*w+x])y++;const end=y;
  if(start===0||end===h)throw new Error('inpaint-boundary-missing');
  for(let yy=start;yy<end;yy++){const f=(yy-start+1)/(end-start+1),p=yy*w+x,a=((t+start-1)*width+l+x)*4,b=((t+end)*width+l+x)*4;let diff=0;for(let k=0;k<3;k++){const v=data[a+k]*(1-f)+data[b+k]*f;diff=Math.max(diff,Math.abs(v-sum[p*3+k]));sum[p*3+k]+=v;}disagreement.push(diff);weight[p]++;}
 }
 disagreement.sort((a,b)=>a-b);const disagreementP95=disagreement[Math.floor(disagreement.length*.95)]??Infinity;
 if(verifySmooth&&disagreementP95>10)throw new Error('inpaint-nonsmooth-boundary');
 // Commit only after every guard has passed; failure never partially erases a source.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*w+x;if(!mask[p])continue;const q=((t+y)*width+l+x)*4;for(let k=0;k<3;k++)data[q+k]=Math.round(sum[p*3+k]/weight[p]);data[q+3]=255;}
 return {pixels:count,radius,disagreementP95,rect:[l,t,w,h] as [number,number,number,number]};
}
