import { describe,expect,it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { newProject } from "../src/lib/project";
import { createTextElement,createShapeElement,createImageElement } from "../src/lib/types";
import { exportNativePPTX } from "../src/lib/native-pptx";
import { verifyNativePptx } from "../src/lib/pptx-diagnostics";
const image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGMUWZXynwEJMDGgAcICAIuIAilBBi5yAAAAAElFTkSuQmCC";
describe("PPTX browser-native exporter",()=>{
 it("exports editable text, shape, image and multiple slides without an HTTP request",async()=>{
  const p=newProject("한글");
  p.assets["pic"]={id:"pic",name:"pic",mime:"image/png",width:4,height:4,original:false,dataUrl:image};
  p.pages[0].background={type:"gradient",from:"#ffffff",to:"#bee4dc",angle:45};
  p.pages[0].elements=Array.from({length:55},(_,i)=>i%3===0?createTextElement({text:i===0?"산업안전보건교육":"안전 교육 "+i,fontFamily:"Noto Sans KR",lineHeight:1.7,letterSpacing:2,x:i*4,y:i*6,width:240,height:42}):i%3===1?createShapeElement("rect",{x:i*5,y:i*4,width:120,height:34,cornerRadius:10}):createImageElement(image,4,4,{assetId:"pic",x:i*3,y:i*4,width:80,height:80}));
  p.pages[0].elements.splice(7,0,createTextElement({text:"hidden native object",visible:false}));
  p.pages.push({...p.pages[0],id:"page_second",elements:[createTextElement({text:"두 번째 페이지"})]});
  const bytes=new Uint8Array(readFileSync(new URL("../public/native-pptx-template.pptx",import.meta.url)));
  const blob=await exportNativePPTX(p,bytes);
  await expect(verifyNativePptx(blob,p)).resolves.toEqual({});
  const output=fileURLToPath(new URL("../../../evidence/studio/native-pptx-smoke.pptx",import.meta.url));
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,new Uint8Array(await blob.arrayBuffer()));
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const damaged=await JSZip.loadAsync(await blob.arrayBuffer());
  damaged.file("ppt/slides/slide1.xml",(await damaged.file("ppt/slides/slide1.xml")!.async("string")).replace(/<p:pic>[\s\S]*?<\/p:pic>/,""));
  await expect(verifyNativePptx(await damaged.generateAsync({type:"blob"}),p)).rejects.toThrow(/불일치/);
  const one=await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(one).toContain('spc="150"');expect(one).toContain('<a:spcPct val="170000"/>');expect(one).toContain("산업안전보건교육");expect(one).toContain('<a:gs pos="0"><a:srgbClr');expect(one).not.toContain('<a:gs pos="0"><a:solidFill>');expect(one).toContain("<p:pic>");expect(one).toContain("prst=\"rect\"");
  expect(await zip.file("ppt/slides/slide2.xml")!.async("string")).toContain("두 번째 페이지");
  expect((await zip.file("ppt/presentation.xml")!.async("string")).match(/<p:sldId /g)).toHaveLength(2);
  expect(zip.file("ppt/media/studio-1.png")).not.toBeNull();expect(blob.size).toBeGreaterThan(1000);
 });
});

it('writes an editable native table, retains exact cell strings and detects missing cells',async()=>{
 const { createTableElement }=await import('../src/lib/types');
 const p=newProject('표');p.pages[0].elements=[createTableElement({rows:3,cols:2,name:'검토한 교육 표',fontFamily:'Noto Sans KR',cells:[{text:'과정'},{text:'인원'},{text:'교육 A'},{text:'1,250'},{text:'교육 B'},{text:'80%'}]})];
 const bytes=new Uint8Array(readFileSync(new URL('../public/native-pptx-template.pptx',import.meta.url)));
 const blob=await exportNativePPTX(p,bytes);await expect(verifyNativePptx(blob,p)).resolves.toEqual({});
 const z=await JSZip.loadAsync(await blob.arrayBuffer());const xml=await z.file('ppt/slides/slide1.xml')!.async('string');
 expect(xml).toContain('uri="http://schemas.openxmlformats.org/drawingml/2006/table"');expect(xml).toContain('<a:tbl>');expect(xml.match(/<a:tc>/g)).toHaveLength(6);expect(xml).toContain('1,250');expect(xml).toContain('교육 B');
 z.file('ppt/slides/slide1.xml',xml.replace(/<a:tc>[\s\S]*?<\/a:tc>/,''));
 await expect(verifyNativePptx(await z.generateAsync({type:'blob'}),p)).rejects.toThrow(/표 셀 누락/);
 const out=fileURLToPath(new URL('../../../evidence/studio/native-table.pptx',import.meta.url));writeFileSync(out,new Uint8Array(await blob.arrayBuffer()));
});

it('exports a true chart with matching embedded spreadsheet and detects corrupted numeric caches',async()=>{
 const {createBarChartElement}=await import('../src/lib/types');
 const p=newProject('검토한 차트');p.pages[0].elements=[createBarChartElement({seriesName:'인원',data:[{label:'교육 A',value:1250},{label:'교육 B',value:80.5}]})];
 const template=new Uint8Array(readFileSync(new URL('../public/native-pptx-template.pptx',import.meta.url)));
 const blob=await exportNativePPTX(p,template);await expect(verifyNativePptx(blob,p)).resolves.toEqual({});
 const z=await JSZip.loadAsync(await blob.arrayBuffer());expect(await z.file('ppt/slides/slide1.xml')!.async('string')).toContain('<c:chart ');
 const cx=await z.file('ppt/charts/chart-1-2.xml')!.async('string');expect(cx).toContain('<c:v>80.5</c:v>');
 const book=await JSZip.loadAsync(await z.file('ppt/embeddings/chart-1-2.xlsx')!.async('uint8array'));
 const sheet=await book.file('xl/worksheets/sheet1.xml')!.async('string');expect(sheet).toContain('<v>1250</v>');expect(sheet).toContain('교육 B');
 z.file('ppt/charts/chart-1-2.xml',cx.replace('<c:v>80.5</c:v>','<c:v>85</c:v>'));
 await expect(verifyNativePptx(await z.generateAsync({type:'blob'}),p)).rejects.toThrow(/차트 값 불일치/);
 writeFileSync(fileURLToPath(new URL('../../../evidence/studio/native-chart.pptx',import.meta.url)),new Uint8Array(await blob.arrayBuffer()));
});
