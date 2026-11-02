import { describe,expect,it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { newProject } from "../src/lib/project";
import { createTextElement,createShapeElement,createImageElement } from "../src/lib/types";
import { exportNativePPTX } from "../src/lib/native-pptx";
const image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGMUWZXynwEJMDGgAcICAIuIAilBBi5yAAAAAElFTkSuQmCC";
describe("PPTX browser-native exporter",()=>{
 it("exports editable text, shape, image and multiple slides without an HTTP request",async()=>{
  const p=newProject("한글");
  p.assets["pic"]={id:"pic",name:"pic",mime:"image/png",width:4,height:4,original:false,dataUrl:image};
  p.pages[0].background={type:"gradient",from:"#ffffff",to:"#bee4dc",angle:45};
  p.pages[0].elements=Array.from({length:55},(_,i)=>i%3===0?createTextElement({text:i===0?"산업안전보건교육":"안전 교육 "+i,fontFamily:"Noto Sans KR",x:i*4,y:i*6,width:240,height:42}):i%3===1?createShapeElement("rect",{x:i*5,y:i*4,width:120,height:34,cornerRadius:10}):createImageElement(image,4,4,{assetId:"pic",x:i*3,y:i*4,width:80,height:80}));
  p.pages.push({...p.pages[0],id:"page_second",elements:[createTextElement({text:"두 번째 페이지"})]});
  const bytes=new Uint8Array(readFileSync(new URL("../public/native-pptx-template.pptx",import.meta.url)));
  const blob=await exportNativePPTX(p,bytes);
  const output=fileURLToPath(new URL("../../../evidence/studio/native-pptx-smoke.pptx",import.meta.url));
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,new Uint8Array(await blob.arrayBuffer()));
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const one=await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(one).toContain("산업안전보건교육");expect(one).toContain('<a:gs pos="0"><a:srgbClr');expect(one).not.toContain('<a:gs pos="0"><a:solidFill>');expect(one).toContain("<p:pic>");expect(one).toContain("prst=\"rect\"");
  expect(await zip.file("ppt/slides/slide2.xml")!.async("string")).toContain("두 번째 페이지");
  expect((await zip.file("ppt/presentation.xml")!.async("string")).match(/<p:sldId /g)).toHaveLength(2);
  expect(zip.file("ppt/media/studio-1.png")).not.toBeNull();expect(blob.size).toBeGreaterThan(1000);
 });
});
