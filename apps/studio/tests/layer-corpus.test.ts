import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { componentBoxes, flatBackgroundMask } from '../src/lib/magic-layers/local-detect';
import { planLocalReplacement, applyLocalPatches } from '../src/lib/magic-layers/preservation';
import type { Region } from '../src/lib/magic-layers/schema';
const root=process.env.STUDIO_LAYER_CORPUS;
it.skipIf(!root)('compares legacy and adaptive proposals on the same 12 authored designs',async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(root!,'manifest.json'),'utf8'));
 const results=[];
 for(const entry of manifest.cases){
  const dir=path.join(root!,entry.id),w=entry.width,h=entry.height;
  const pixels=new Uint8ClampedArray(await sharp(path.join(dir,'original.png')).ensureAlpha().raw().toBuffer());
  const truth=await Promise.all(entry.objects.map(async(o:{mask:string})=>new Uint8Array(await sharp(path.join(dir,o.mask)).greyscale().raw().toBuffer())));
  for(const strategy of ['legacy','adaptive'] as const){
   const start=performance.now(),boxes=componentBoxes(pixels,w,h,strategy),regions:Region[]=[],masks:Uint8Array[]=[];
   for(const [l,t,r,b] of boxes){
    const crop=new Uint8ClampedArray((r-l)*(b-t)*4);
    for(let y=t;y<b;y++)crop.set(pixels.subarray((y*w+l)*4,(y*w+r)*4),(y-t)*(r-l)*4);
    const alpha=flatBackgroundMask(crop,r-l,b-t);if(!alpha)continue;
    const full=new Uint8Array(w*h);for(let y=t;y<b;y++)full.set(alpha.subarray((y-t)*(r-l),(y-t+1)*(r-l)),y*w+l);
    regions.push({id:`r${regions.length}`,type:'image',bbox:[l/w*1000,t/h*1000,(r-l)/w*1000,(b-t)/h*1000],zIndex:regions.length,review:true});masks.push(full);
   }
   const plan=planLocalReplacement(pixels,w,h,regions,[],true),background=applyLocalPatches(pixels,w,plan.patches),composite=new Uint8ClampedArray(background);
   const accepted=plan.accepted.map(r=>regions.indexOf(r)),pairs:{candidate:number;object:number;iou:number}[]=[];
   for(const i of accepted){
    for(let p=0;p<w*h;p++)if(masks[i][p]){for(let c=0;c<3;c++)composite[p*4+c]=pixels[p*4+c];}
    for(let j=0;j<truth.length;j++){let intersection=0,union=0;for(let p=0;p<w*h;p++){const a=masks[i][p]>127,b=truth[j][p]>127;if(a&&b)intersection++;if(a||b)union++;}pairs.push({candidate:i,object:j,iou:union?intersection/union:0});}
   }
   const used=new Set<number>(),matched=new Set<number>(),matches=[];
   for(const pair of pairs.sort((a,b)=>b.iou-a.iou))if(pair.iou>=.5&&!used.has(pair.candidate)&&!matched.has(pair.object)){used.add(pair.candidate);matched.add(pair.object);matches.push(pair);}
   const removal=[];
   for(const match of matches){
    const expected=await sharp(path.join(dir,entry.objects[match.object].without)).ensureAlpha().raw().toBuffer();
    const [l,t,rw,rh]=plan.patches.find(p=>p.id===regions[match.candidate].id)!.rect;let mae=0;
    for(let y=t;y<t+rh;y++)for(let x=l;x<l+rw;x++)for(let c=0;c<3;c++)mae+=Math.abs(background[(y*w+x)*4+c]-expected[(y*w+x)*4+c]);
    removal.push(mae/(rw*rh*3));
   }
   let mae=0;for(let p=0;p<w*h;p++)for(let c=0;c<3;c++)mae+=Math.abs(composite[p*4+c]-pixels[p*4+c]);
   const elapsedMs=performance.now()-start;
   await sharp(composite,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(dir,`${strategy}-composite.png`));
   await sharp(background,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(dir,`${strategy}-background.png`));
   const maskImage=new Uint8Array(w*h);for(const i of accepted)for(let p=0;p<w*h;p++)maskImage[p]=Math.max(maskImage[p],masks[i][p]);
   await sharp(maskImage,{raw:{width:w,height:h,channels:1}}).png().toFile(path.join(dir,`${strategy}-mask.png`));
   results.push({case:entry.id,strategy,groundTruthObjects:truth.length,boxes:boxes.length,accepted:accepted.length,matched:matches.length,falseCandidates:accepted.length-matches.length,missed:truth.length-matches.length,matches,removalMae:removal,recompositionMae:mae/(w*h*3),elapsedMs,ocr:'not run',semanticRecognition:false,layerD:'BLOCKED: model host denied'});
  }
 }
 await fs.writeFile(path.join(root!,'results.json'),JSON.stringify(results,null,2));
 expect(results).toHaveLength(24);
 // Predeclared adoption gate: preserve matched objects and composition in every case.
 for(const entry of manifest.cases){const a=results.find(r=>r.case===entry.id&&r.strategy==='legacy')!,b=results.find(r=>r.case===entry.id&&r.strategy==='adaptive')!;expect(b.matched,entry.id).toBeGreaterThanOrEqual(a.matched);expect(b.recompositionMae,entry.id).toBeLessThanOrEqual(a.recompositionMae+.01);expect(b.falseCandidates,entry.id).toBeLessThanOrEqual(a.falseCandidates);}
 expect(results.filter(r=>r.strategy==='adaptive').reduce((s,r)=>s+r.matched,0)).toBeGreaterThan(results.filter(r=>r.strategy==='legacy').reduce((s,r)=>s+r.matched,0));
},120_000);
