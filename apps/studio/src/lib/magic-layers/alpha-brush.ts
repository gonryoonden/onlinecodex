/** Paint only alpha, preserving the original cutout RGB and its maximum alpha.
 * Restore cannot invent pixels outside the initial cutout. Source raster and
 * background repair remain separate operations. Coordinates are source pixels. */
export function paintAlpha(alpha:Uint8Array, base:Uint8Array, width:number, height:number,
  from:readonly [number,number], to:readonly [number,number], radius:number, restore:boolean) {
  if(alpha.length!==width*height||base.length!==alpha.length||!Number.isFinite(radius)||radius<1||radius>100||![...from,...to].every(Number.isFinite))
    throw new Error("경계 브러시 좌표 또는 크기가 잘못되었습니다.");
  // Distance to a segment avoids gaps even when pointer events are sparse.
  const dx=to[0]-from[0],dy=to[1]-from[1],length=dx*dx+dy*dy;
  const left=Math.max(0,Math.floor(Math.min(from[0],to[0])-radius)),right=Math.min(width-1,Math.ceil(Math.max(from[0],to[0])+radius));
  const top=Math.max(0,Math.floor(Math.min(from[1],to[1])-radius)),bottom=Math.min(height-1,Math.ceil(Math.max(from[1],to[1])+radius));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
    const t=length?Math.max(0,Math.min(1,((x+.5-from[0])*dx+(y+.5-from[1])*dy)/length)):0;
    if((x+.5-from[0]-t*dx)**2+(y+.5-from[1]-t*dy)**2<=radius*radius){const i=y*width+x;alpha[i]=restore?base[i]:0;}
  }
}
