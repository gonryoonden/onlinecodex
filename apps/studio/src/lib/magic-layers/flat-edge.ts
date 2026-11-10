/** Conservative flat-matte decontamination. Only the one-pixel outer edge is
 * eligible; opaque interiors, faint ink, holes and ambiguous colors stay intact.
 * This is local color estimation, not semantic segmentation or shadow recovery. */
export function refineFlatEdges(source: Uint8ClampedArray, w: number, h: number,
  mask: Uint8Array, background?: readonly number[]) {
  if (!background) {
    const border:number[][]=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<2||y<2||x>=w-2||y>=h-2)
      border.push(Array.from(source.slice((y*w+x)*4,(y*w+x)*4+3)));
    background=[0,1,2].map(c=>border.map(v=>v[c]).sort((a,b)=>a-b)[Math.floor(border.length/2)]);
  }
  if (source.length !== w*h*4 || mask.length !== w*h || background.length !== 3)
    throw new Error("경계 이미지 크기 불일치");
  const out = new Uint8ClampedArray(source); let refined = 0;
  for (let i=0;i<mask.length;i++) out[i*4+3] = Math.round(source[i*4+3]*mask[i]/255);
  const distance=(i:number)=>Math.max(...background.map((b,c)=>Math.abs(source[i*4+c]-b)));
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
    const i=y*w+x;
    if(mask[i]!==255 || source[i*4+3]!==255) continue;
    if([i-1,i+1,i-w,i+w].every(n=>mask[n]!==0)) continue;
    const v=background.map((b,c)=>source[i*4+c]-b),contrast=distance(i);
    let best:number[]|undefined,bestAlpha=1,bestError=Infinity;
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++) {
      const xx=x+dx,yy=y+dy;
      if(xx<1||yy<1||xx>=w-1||yy>=h-1) continue;
      const n=yy*w+xx;
      if(mask[n]!==255 || distance(n)<Math.max(20,contrast*1.2))continue;
      // A stable interior patch, not an antialiased pixel or another edge.
      if([n-1,n+1,n-w,n+w].some(k=>mask[k]!==255 || [0,1,2].some(c=>Math.abs(source[k*4+c]-source[n*4+c])>3)))continue;
      const f=background.map((b,c)=>source[n*4+c]-b);
      const alpha=v.reduce((sum,c,j)=>sum+c*f[j],0)/f.reduce((sum,c)=>sum+c*c,0);
      if(alpha<.08||alpha>.96) continue;
      const error=Math.max(...v.map((c,j)=>Math.abs(c-alpha*f[j])));
      if(error>2 || error>=bestError)continue;
      bestError=error;bestAlpha=alpha;best=[source[n*4],source[n*4+1],source[n*4+2]];
    }
    if(best){out.set([...best,Math.round(bestAlpha*255)],i*4);refined++;}
  }
  return {data:out,refined};
}
