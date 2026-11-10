import { it,expect } from "vitest";
import { refineFlatEdges } from "../src/lib/magic-layers/flat-edge";
import { flatBackgroundMask } from "../src/lib/magic-layers/local-detect";

it("removes flat background fringe on known antialiased edges without changing opaque core",()=>{
  for(const bg of [[255,255,255],[220,240,225]]) {
    const w=40,h=40,fg=[30,90,200],pixels=new Uint8ClampedArray(w*h*4),truth=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x,a=x>=10&&x<30&&y>=10&&y<30 ? (x===10||x===29||y===10||y===29?.4:1):0;
      truth[i]=Math.round(a*255);pixels.set([...bg.map((b,c)=>Math.round(a*fg[c]+(1-a)*b)),255],i*4);
    }
    const mask=flatBackgroundMask(pixels,w,h)!;
    const result=refineFlatEdges(pixels,w,h,mask,bg);
    expect(result.refined).toBeGreaterThan(60);
    let before=0,after=0;
    for(let i=0;i<w*h;i++)for(let c=0;c<3;c++){
      const expected=fg[c]*truth[i]/255;
      before+=Math.abs(pixels[i*4+c]*mask[i]/255-expected);
      after+=Math.abs(result.data[i*4+c]*result.data[i*4+3]/255-expected);
      if(truth[i]===255)expect(result.data[i*4+c]).toBe(pixels[i*4+c]);
    }
    expect(after).toBeLessThan(before*.1);
    expect(result.data[0*4+3]).toBe(0);
  }
});

it("retains faint isolated ink and internal hole without inventing a foreground color",()=>{
  const w=40,h=40,p=new Uint8ClampedArray(w*h*4).fill(255);
  for(let y=8;y<32;y++)for(let x=8;x<32;x++)if(x<12||x>27||y<12||y>27)p.set([243,243,243,255],(y*w+x)*4);
  const m=flatBackgroundMask(p,w,h)!;
  const r=refineFlatEdges(p,w,h,m,[255,255,255]);
  expect(r.refined).toBe(0);expect(r.data[(20*w+20)*4+3]).toBe(0);
  expect([...r.data.slice((10*w+10)*4,(10*w+10)*4+4)]).toEqual([243,243,243,255]);
});
