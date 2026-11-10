import type { Asset } from './project';
import { loadImage } from './imports';
export interface TableGrid { x:number;y:number;width:number;height:number;rows:number;cols:number;colWidths:number[] }
const centers=(values:number[])=>{
 const groups:number[][]=[];
 for(const v of values){const last=groups.at(-1);if(last&&v-last.at(-1)!<=2)last.push(v);else groups.push([v]);}
 return groups.map(g=>(g[0]+g.at(-1)!)/2);
};
/** Bounded, conservative ruled-grid detector. No OCR, data inference, merged cells,
 * charts, borderless tables or perspective correction. Returns the largest grid. */
export function detectRuledGrid(data:Uint8ClampedArray,w:number,h:number):TableGrid|null {
 if(w<60||h<40||w*h>2_000_000||data.length!==w*h*4)return null;
 const dark=new Uint8Array(w*h);
 for(let i=0;i<dark.length;i++)dark[i]=data[i*4+3]>240&&Math.max(data[i*4],data[i*4+1],data[i*4+2])<170?1:0;
 const spans:{left:number;right:number;ys:number[]}[]=[];
 for(let y=0;y<h;y++){
  let x=0;
  while(x<w){if(!dark[y*w+x]){x++;continue;}const left=x;while(x<w&&dark[y*w+x])x++;const right=x-1;
   if(right-left<Math.max(60,w*.15))continue;
   const group=spans.find(s=>Math.abs(s.left-left)<=2&&Math.abs(s.right-right)<=2);
   if(group)group.ys.push(y);else if(spans.length<256)spans.push({left,right,ys:[y]});
  }
 }
 const found:TableGrid[]=[];
 for(const span of spans){
  const ys=centers([...new Set(span.ys)]);if(ys.length<3||ys.length>21)continue;
  const top=ys[0],bottom=ys.at(-1)!,xs:number[]=[];
  for(let x=span.left;x<=span.right;x++){
   let count=0;for(let y=Math.ceil(top);y<=Math.floor(bottom);y++)count+=dark[y*w+x];
   if(count/(Math.floor(bottom)-Math.ceil(top)+1)>.97)xs.push(x);
  }
  const cols=centers(xs);if(cols.length<3||cols.length>13)continue;
  const rowH=(bottom-top)/(ys.length-1);
  // Studio currently supports uniform rows and unmerged rectangular cells only.
  if(rowH<10||ys.slice(1).some((v,i)=>Math.abs(v-ys[i]-rowH)>Math.max(2,rowH*.05)))continue;
  const colWidths=cols.slice(1).map((v,i)=>v-cols[i]);if(colWidths.some(v=>v<10))continue;
  if(Math.abs(cols[0]-span.left)>3||Math.abs(cols.at(-1)!-span.right)>3)continue;
  found.push({x:cols[0],y:top,width:cols.at(-1)!-cols[0],height:bottom-top,rows:ys.length-1,cols:cols.length-1,colWidths});
 }
 return found.sort((a,b)=>b.width*b.height-a.width*a.height)[0]??null;
}
export async function detectTableInAsset(source:Asset):Promise<TableGrid|null>{
 if(source.width*source.height>16_000_000)throw new Error('표 탐지는16MP 이하 이미지를 지원합니다.');
 const image=await loadImage(source.dataUrl),scale=Math.min(1,1200/Math.max(source.width,source.height));
 const c=document.createElement('canvas');c.width=Math.round(source.width*scale);c.height=Math.round(source.height*scale);
 const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,c.width,c.height);
 const grid=detectRuledGrid(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height);if(!grid)return null;
 const sx=source.width/c.width,sy=source.height/c.height;
 return {...grid,x:grid.x*sx,y:grid.y*sy,width:grid.width*sx,height:grid.height*sy,colWidths:grid.colWidths.map(v=>v*sx)};
}
export function confirmedCells(tsv:string,rows:number,cols:number){
 let lines=tsv.replace(/\r\n?/g,'\n').split('\n');if(lines.length===rows+1&&lines.at(-1)==='')lines=lines.slice(0,-1);
 const cells=lines.map(line=>line.split('\t'));
 if(cells.length!==rows||cells.some(row=>row.length!==cols||row.some(s=>s.length>2000)))throw new Error(`탭으로 구분한 ${rows}행 × ${cols}열을 입력하세요. 셀당 최대 2000자입니다.`);
 return cells.flat().map(text=>({text}));
}
