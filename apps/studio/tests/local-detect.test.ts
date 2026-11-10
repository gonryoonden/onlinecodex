import { it, expect } from "vitest";
import { componentBoxes, flatBackgroundMask } from "../src/lib/magic-layers/local-detect";
it("finds compact colored components and excludes large background cards",()=>{
 const w=200,h=150,p=new Uint8ClampedArray(w*h*4).fill(255);
 for(let y=30;y<55;y++)for(let x=40;x<65;x++){const i=(y*w+x)*4;p[i]=20;p[i+1]=60;p[i+2]=230;}
 expect(componentBoxes(p,w,h)).toEqual([[35,25,70,60]]);
 for(let y=70;y<120;y++)for(let x=5;x<195;x++){const i=(y*w+x)*4;p[i]=20;p[i+1]=60;p[i+2]=230;}
 expect(componentBoxes(p,w,h)).toHaveLength(1);
});
it("blank input produces no invented objects",()=>expect(componentBoxes(new Uint8ClampedArray(100*100*4).fill(255),100,100)).toEqual([]));

it("preserves faint arcs and colored interiors on white and tinted flat backgrounds",()=>{
 for(const bg of [[255,255,255],[240,245,250]]){
  const w=40,h=40,p=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++)p.set([...bg,255],i*4);
  for(let y=10;y<30;y++)for(let x=10;x<30;x++)p.set([bg[0]-12,bg[1]-12,bg[2]-12,255],(y*w+x)*4);
  p.set([10,80,220,255],(20*w+20)*4);
  const mask=flatBackgroundMask(p,w,h)!;
  expect(mask).not.toBeNull();expect(mask[15*w+15]).toBe(255);expect(mask[20*w+20]).toBe(255);expect(mask[0]).toBe(0);
 }
});
it("rejects textured or transparent perimeter and empty candidates",()=>{
 const p=new Uint8ClampedArray(40*40*4).fill(255);
 expect(flatBackgroundMask(p,40,40)).toBeNull();
 for(let y=10;y<30;y++)for(let x=10;x<30;x++)p[(y*40+x)*4]=0;
 for(let x=0;x<40;x++)p[x*4]=100;
 expect(flatBackgroundMask(p,40,40)).toBeNull();
 p.fill(255);p[3]=0;expect(flatBackgroundMask(p,40,40)).toBeNull();
});

it("joins a three-pixel outline break but retains distant objects and rejects a wide text-like band",()=>{
 const w=300,h=200,p=new Uint8ClampedArray(w*h*4).fill(255);
 const rect=(l:number,t:number,r:number,b:number)=>{for(let y=t;y<b;y++)for(let x=l;x<r;x++)p.set([20,60,230,255],(y*w+x)*4);};
 rect(20,30,40,55);rect(42,30,62,55); // one fragmented illustration, gap2 empty pixels
 rect(150,30,175,55); // independent object
 expect(componentBoxes(p,w,h)).toEqual([[15,25,67,60],[145,25,180,60]]);
 rect(5,110,290,120);expect(componentBoxes(p,w,h)).toHaveLength(2);
});

it('adaptive proposals recover light neutral objects and ignore flat saturated backgrounds',()=>{
 for(const bg of [[250,250,250],[22,45,90]]){
  const w=300,h=200,p=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++)p.set([...bg,255],i*4);
  for(let y=80;y<120;y++)for(let x=100;x<140;x++)p.set([168,168,168,255],(y*w+x)*4);
  expect(componentBoxes(p,w,h,'legacy')).toHaveLength(0);
  expect(componentBoxes(p,w,h,'adaptive')).toEqual([[95,75,145,125]]);
 }
});
it('adaptive uniform images never invent layers; a non-flat perimeter keeps legacy proposals',()=>{
 const w=300,h=200,p=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++)p.set([22,45,90,255],i*4);
 expect(componentBoxes(p,w,h,'adaptive')).toHaveLength(0);
 for(let x=0;x<w;x++)p.set([255,255,255,255],x*4);
 expect(componentBoxes(p,w,h,'adaptive')).toEqual(componentBoxes(p,w,h,'legacy'));
});
it('adaptive mode retains pale aligned word fragments in the original',()=>{
 const w=300,h=200,p=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++)p.set([22,45,90,255],i*4);
 for(const l of [30,65])for(let y=25;y<45;y++)for(let x=l;x<l+27;x++)p.set([230,230,230,255],(y*w+x)*4);
 expect(componentBoxes(p,w,h,'adaptive')).toHaveLength(0);
});
