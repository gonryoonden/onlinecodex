/** SAM uses half-pixel bilinear interpolation, longest-side resize, then zero padding. */
export function bilinear(data:Float32Array,w:number,h:number,x:number,y:number){
 const xx=Math.max(0,Math.min(w-1,x)),yy=Math.max(0,Math.min(h-1,y)),l=Math.floor(xx),t=Math.floor(yy),r=Math.min(w-1,l+1),b=Math.min(h-1,t+1),dx=xx-l,dy=yy-t;
 return (data[t*w+l]*(1-dx)+data[t*w+r]*dx)*(1-dy)+(data[b*w+l]*(1-dx)+data[b*w+r]*dx)*dy;
}
export function upsampleLogits(low:Float32Array){
 if(low.length!==256*256)throw new Error('SAM output dimensions mismatch');
 const full=new Float32Array(1024*1024);
 for(let y=0;y<1024;y++)for(let x=0;x<1024;x++)full[y*1024+x]=bilinear(low,256,256,(x+.5)/4-.5,(y+.5)/4-.5);
 return full;
}
export function imageSize(width:number,height:number){
 const scale=1024/Math.max(width,height);return {width:Math.floor(width*scale+.5),height:Math.floor(height*scale+.5)};
}
