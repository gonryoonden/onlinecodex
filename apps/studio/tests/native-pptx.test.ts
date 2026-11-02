import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { newProject } from "../src/lib/project";
import { createTextElement,createShapeElement,createImageElement } from "../src/lib/types";
import { exportNativePPTX } from "../src/lib/native-pptx";
const image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGP8YGT0nwEJMDGgAcICAJl6Alu64bLBAAAAAElFTkSuQmCC";
describe("PPTX browser-native exporter",()=>{
 it("exports editable text, shape, image and multiple slides without an HTTP request",async()=>{
  const p=newProject("한글");
  p.assets["pic"]={id:"pic",name:"pic",mime:"image/png",width:4,height:4,original:false,dataUrl:image};
  p.pages[0].elements=[createTextElement({text:"산업안전보건교육",fontFamily:"Noto Sans KR",width:280,height:45}),createShapeElement("rect",{x:20,y:60,width:90,height:40,cornerRadius:0}),createImageElement(image,4,4,{assetId:"pic",x:40,y:120,width:90,height:90})];
  p.pages.push({...p.pages[0],id:"page_second",elements:[createTextElement({text:"두 번째 페이지"})]});
  const bytes=new Uint8Array(readFileSync(new URL("../public/native-pptx-template.pptx",import.meta.url)));
  const blob=await exportNativePPTX(p,bytes);
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const one=await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(one).toContain("산업안전보건교육");expect(one).toContain("<p:pic>");expect(one).toContain("prst=\"rect\"");
  expect(await zip.file("ppt/slides/slide2.xml")!.async("string")).toContain("두 번째 페이지");
  expect((await zip.file("ppt/presentation.xml")!.async("string")).match(/<p:sldId /g)).toHaveLength(2);
  expect(zip.file("ppt/media/studio-1.png")).not.toBeNull();expect(blob.size).toBeGreaterThan(1000);
 });
});
