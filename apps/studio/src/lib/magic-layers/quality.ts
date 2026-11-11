/** Evidence, not consent, determines automatic eligibility. Scores are not probabilities. */
import type { CandidateOutcome } from './candidates';
export type Decision='ready'|'warning'|'review'|'failed';
export function summarize(candidates:CandidateOutcome[]){
 const count=(decision:Decision)=>candidates.filter(c=>c.decision===decision).length;
 return {total:candidates.length,ready:count('ready'),warning:count('warning'),review:count('review'),failed:count('failed'),merged:candidates.filter(c=>c.status==='merged').length,excluded:candidates.filter(c=>c.status==='user-excluded').length};
}
/** Detect substantial background-colored islands inside opaque mask support.
 * Border median supplies a local reference; a 2px erosion excludes antialias seams.
 * This detects filled holes/leakage, not all possible semantic errors. Never edits a mask. */
export function inspectInteriorBackground(rgba:Uint8ClampedArray,alpha:Uint8Array,w:number,h:number){
 const samples:number[][]=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((x===0||y===0||x===w-1||y===h-1)&&!alpha[y*w+x])samples.push([rgba[(y*w+x)*4],rgba[(y*w+x)*4+1],rgba[(y*w+x)*4+2]]);
 if(samples.length<8)return {reference:false,largest:0,fraction:0,blocked:false};
 const color=[0,1,2].map(k=>samples.map(s=>s[k]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]);
 const near=new Uint8Array(w*h);let ink=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(alpha[i]<128)continue;ink++;
  if(x<2||y<2||x>=w-2||y>=h-2)continue;
  let interior=true;for(let yy=y-2;yy<=y+2&&interior;yy++)for(let xx=x-2;xx<=x+2;xx++)if(alpha[yy*w+xx]<128){interior=false;break;}
  if(interior&&color.every((c,k)=>Math.abs(rgba[i*4+k]-c)<=10))near[i]=1;
 }
 let largest=0;const queue=new Int32Array(w*h);
 for(let i=0;i<near.length;i++)if(near[i]){
  let head=0,tail=1;queue[0]=i;near[i]=0;
  while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&near[n]){near[n]=0;queue[tail++]=n;}}
  largest=Math.max(largest,tail);
 }
 const fraction=largest/Math.max(1,ink);
 return {reference:true,largest,fraction,blocked:largest>=16&&fraction>=.02};
}
