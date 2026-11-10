import { it,expect } from 'vitest';
import { paintAlpha } from '../src/lib/magic-layers/alpha-brush';
import { newProject,validateProject } from '../src/lib/project';
import { createImageElement } from '../src/lib/types';
it('continuous alpha strokes erase without gaps and restore only original alpha',()=>{
 const base=new Uint8Array(100*80).fill(255);base[40*100+50]=80;base[40*100+51]=0;
 const a=base.slice();paintAlpha(a,base,100,80,[10,40],[90,40],4,false);
 for(let x=10;x<90;x++)expect(a[40*100+x]).toBe(0);
 expect(a[10*100+10]).toBe(255);
 paintAlpha(a,base,100,80,[10,40],[90,40],4,true);expect(a).toEqual(base);
 expect(()=>paintAlpha(a,base,100,80,[NaN,0],[1,1],5,false)).toThrow();
});
it('rejects archives that lost the immutable alpha editing source',()=>{
 const p=newProject();p.pages[0].elements=[createImageElement('data:image/png;base64,AAAA',10,10,{provenance:{source:'source',method:'manual-alpha',review:true,alphaEdit:{baseAssetId:'missing'}}})];
 expect(()=>validateProject(p)).toThrow(/누락된 경계 보정/);
});
