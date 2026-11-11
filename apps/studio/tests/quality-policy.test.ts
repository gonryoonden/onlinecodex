import {describe,it,expect} from 'vitest';
import {inspectInteriorBackground,summarize} from '../src/lib/magic-layers/quality';
import {inpaintSupport} from '../src/lib/magic-layers/inpaint';
describe('evidence-based exceptions',()=>{
 it('flags a filled background hole, accepts a solid object and real transparent hole',()=>{
  const w=40,h=40,rgba=new Uint8ClampedArray(w*h*4),alpha=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,inside=x>5&&x<34&&y>5&&y<34;rgba.set([0,150,0,255],i*4);if(inside){alpha[i]=255;rgba[i*4]=200;}}
  expect(inspectInteriorBackground(rgba,alpha,w,h).blocked).toBe(false);
  for(let y=14;y<26;y++)for(let x=14;x<26;x++)rgba[(y*w+x)*4]=0;
  expect(inspectInteriorBackground(rgba,alpha,w,h).blocked).toBe(true);
  for(let y=14;y<26;y++)for(let x=14;x<26;x++)alpha[y*w+x]=0;
  expect(inspectInteriorBackground(rgba,alpha,w,h).blocked).toBe(false);
 });
 it('rejects ambiguous directional reconstruction without partial source writes',()=>{
  const data=new Uint8ClampedArray(80*80*4).fill(255);for(let y=0;y<80;y++)for(let x=0;x<80;x++)data[(y*80+x)*4]=x%2?0:255;
  const original=data.slice();expect(()=>inpaintSupport(data,80,80,{alpha:new Uint8Array(15*15).fill(255),x:30,y:30,width:15,height:15},[],2,true)).toThrow('nonsmooth');expect(data).toEqual(original);
 });
 it('counts disjoint states and excludes duplicates from editable totals',()=>{
  expect(summarize([{id:'a',type:'image',status:'generated',background:'local-flat',decision:'ready'},{id:'b',type:'image',status:'merged',background:'pending',canonicalId:'a'}])).toEqual({total:2,ready:1,warning:0,review:0,failed:0,merged:1,excluded:0});
 });
});
