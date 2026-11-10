import { it,expect } from 'vitest';
import { detectRuledGrid,confirmedCells } from '../src/lib/table-grid';
import { newProject,validateProject } from '../src/lib/project';
import { createTableElement } from '../src/lib/types';
function gridFixture(ys=[20,60,100,140]){
 const w=300,h=180,p=new Uint8ClampedArray(w*h*4).fill(255);
 for(const y of ys)for(let x=30;x<=270;x++)p.set([30,30,30,255],(y*w+x)*4);
 for(const x of [30,110,270])for(let y=ys[0];y<=ys.at(-1)!;y++)p.set([30,30,30,255],(y*w+x)*4);
 return {p,w,h};
}
it('detects a 3x2 ruled table with unequal columns without inventing data',()=>{
 const {p,w,h}=gridFixture();expect(detectRuledGrid(p,w,h)).toEqual({x:30,y:20,width:240,height:120,rows:3,cols:2,colWidths:[80,160]});
});
it('rejects nonuniform rows, a blank page and an unclosed grid',()=>{
 const {p,w,h}=gridFixture([20,40,100,140]);expect(detectRuledGrid(p,w,h)).toBeNull();
 expect(detectRuledGrid(new Uint8ClampedArray(w*h*4).fill(255),w,h)).toBeNull();
 const a=gridFixture();for(let y=0;y<h;y++)a.p.set([255,255,255,255],(y*w+110)*4);
 expect(detectRuledGrid(a.p,w,h)).toBeNull();
});
it('preserves user-verified mixed Korean/numeric strings literally and rejects wrong cell counts',()=>{
 expect(confirmedCells('종류\t인원\n교육 A\t1,250\n교육 B\t80%\n',3,2).map(c=>c.text)).toEqual(['종류','인원','교육 A','1,250','교육 B','80%']);
 expect(()=>confirmedCells('불명확\t?\n12',2,2)).toThrow();
});
it('round-trips table cells and enforces bounded structural integrity',()=>{
 const p=newProject();p.pages[0].elements=[createTableElement({rows:2,cols:2,cells:[{text:'제목'},{text:'인원'},{text:'교육'},{text:'42'}]})];
 expect(validateProject(p).pages[0].elements).toEqual(p.pages[0].elements.map(({_m:_,...v})=>{void _;return v;}));
 const bad=structuredClone(p);(bad.pages[0].elements[0] as ReturnType<typeof createTableElement>).cells.pop();expect(()=>validateProject(bad)).toThrow();
 const rotated=structuredClone(p);rotated.pages[0].elements[0].rotation=10;expect(validateProject(rotated).pages[0].elements[0].rotation).toBe(10);
});

it('chart conversion accepts only reviewed literal nonnegative numeric cells',async()=>{
 const {verifiedTableSeries}=await import('../src/lib/bar-chart');
 const table=createTableElement({rows:3,cols:2,cells:[{text:'과정'},{text:'인원'},{text:'교육 A'},{text:'1250'},{text:'교육 B'},{text:'80.5'}]});
 expect(verifiedTableSeries(table)).toEqual({seriesName:'인원',data:[{label:'교육 A',value:1250},{label:'교육 B',value:80.5}]});
 for(const bad of ['80%','1,250','?','', '-5','NaN','1e3']){const t=structuredClone(table);t.cells[3].text=bad;expect(()=>verifiedTableSeries(t)).toThrow();}
});
