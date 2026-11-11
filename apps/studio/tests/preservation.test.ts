import { describe, it, expect } from "vitest";
import { planLocalReplacement, applyLocalPatches } from "../src/lib/magic-layers/preservation";
import { snapshotStage, unexplainedLosses, assessInventory } from "../src/lib/magic-layers/diagnostics";
import type { Region } from "../src/lib/magic-layers/schema";
const region: Region = { id: "title", type: "text", text: "한글", bbox: [200,200,200,200], zIndex: 1, review: true };
function pixels() { const data = new Uint8ClampedArray(100*100*4).fill(255); for(let y=23;y<37;y++)for(let x=23;x<37;x++){const i=(y*100+x)*4;data[i]=data[i+1]=data[i+2]=0;}return data; }
describe("source-preserving replacements",()=>{
 it("requires review; an unreviewed region stays raster instead of duplicate text",()=>{
  expect(planLocalReplacement(pixels(),100,100,[region],[],false).accepted).toHaveLength(0);
 });
 it("limits erasure to the isolated reviewed box on a measured flat background",()=>{
  const plan=planLocalReplacement(pixels(),100,100,[region],[],true);
  expect(plan.accepted.map(r=>r.id)).toEqual(["title"]);
  expect(plan.patches[0].color).toEqual([255,255,255]);
  expect(plan.patches[0].rect).toEqual([20,20,20,20]);
  const original=pixels(),patched=applyLocalPatches(original,100,plan.patches);
  for(let y=0;y<100;y++)for(let x=0;x<100;x++){
    const i=(y*100+x)*4;
    if(x>=20&&x<40&&y>=20&&y<40)expect([...patched.slice(i,i+4)]).toEqual([255,255,255,255]);
    else expect(patched.slice(i,i+4)).toEqual(original.slice(i,i+4));
  }
 });
 it("preserves excluded/overlapping content and complex boundaries",()=>{
  expect(planLocalReplacement(pixels(),100,100,[region,{...region,id:"caption"}],['caption'],true).accepted).toHaveLength(0);
  const data=pixels();for(let y=18;y<42;y++)for(let x=18;x<42;x++){if(x%2===0)data[(y*100+x)*4]=0;}
  expect(planLocalReplacement(data,100,100,[region],[],true).accepted).toHaveLength(0);
 });
 it("does not force text-only images to have illustration layers",()=>{
  expect(assessInventory([region],"text-only")).not.toContain("ILLUSTRATIONS_MISSING");
  expect(assessInventory([region],"illustrated")).toContain("ILLUSTRATIONS_MISSING");
 });
 it("detects unexplained ID loss but accepts explicit preserved/excluded reasons",()=>{
  const before=snapshotStage("normalized",[region]);
  expect(unexplainedLosses(before,snapshotStage("reviewed",[]))).toEqual(["title"]);
  expect(unexplainedLosses(before,snapshotStage("reviewed",[],[{id:"title",type:"text",reason:"user-excluded"}]))).toEqual([]);
 });
});

it("keeps a containing card raster while extracting its isolated text",()=>{
 const card:Region={id:"card",type:"shape",shape:"rect",bbox:[100,100,700,700],zIndex:0,review:true};
 const plan=planLocalReplacement(pixels(),100,100,[card,region],[],true);
 expect(plan.accepted.map(r=>r.id)).toEqual(["title"]);
 expect(plan.retained.find(r=>r.id==="card")?.reason).toBe("overlap");
});
it("supports explicit per-region manual flat repair without global approval",()=>{
 const manual={...region,manualBackground:{color:"#ffffff",confirmed:true as const}};
 expect(planLocalReplacement(pixels(),100,100,[manual],[],false).accepted).toHaveLength(1);
 // A user correction never bypasses a collision with another object.
 expect(planLocalReplacement(pixels(),100,100,[manual,{...region,id:"other"}],[],false).accepted).toHaveLength(0);
});

it("manual repair cannot erase excluded or out-of-bounds objects",()=>{
 const manual={...region,manualBackground:{color:"#ffffff",confirmed:true as const}};
 expect(planLocalReplacement(pixels(),100,100,[manual],["title"],true).accepted).toHaveLength(0);
 expect(planLocalReplacement(pixels(),100,100,[{...manual,bbox:[990,990,200,200]}],[],true).accepted).toHaveLength(0);
});
