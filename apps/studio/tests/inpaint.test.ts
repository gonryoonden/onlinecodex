import {it,expect} from 'vitest';
import {inpaintSupport} from '../src/lib/magic-layers/inpaint';
function source(){const a=new Uint8ClampedArray(80*60*4);for(let y=0;y<60;y++)for(let x=0;x<80;x++){const i=(y*80+x)*4;a[i]=30+x+y;a[i+1]=40+x;a[i+2]=60+y;a[i+3]=255;}return a;}
it('removes ink on a known gradient with bounded writes and no original ghost pixels',()=>{
 const expected=source(),data=expected.slice(),alpha=new Uint8Array(20*20).fill(255);for(let y=20;y<40;y++)for(let x=30;x<50;x++)data[(y*80+x)*4]=255;
 const before=data.slice();const result=inpaintSupport(data,80,60,{alpha,x:30,y:20,width:20,height:20},[],2);expect(result.pixels).toBe(24*24);
 for(let y=0;y<60;y++)for(let x=0;x<80;x++){const i=(y*80+x)*4;for(let k=0;k<4;k++){if(x>=28&&x<52&&y>=18&&y<42)expect(Math.abs(data[i+k]-expected[i+k])).toBeLessThanOrEqual(1);else expect(data[i+k]).toBe(before[i+k]);}}
});
it('rejects adjacency/edge conflicts before changing any pixels',()=>{
 const data=source(),before=data.slice(),alpha=new Uint8Array(400).fill(255);
 expect(()=>inpaintSupport(data,80,60,{alpha,x:30,y:20,width:20,height:20},[[48,20,8,8]],2)).toThrow(/neighbor/);expect(data).toEqual(before);
 expect(()=>inpaintSupport(data,80,60,{alpha,x:0,y:0,width:20,height:20},[],2)).toThrow(/edge/);expect(data).toEqual(before);
});
