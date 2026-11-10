import JSZip from "jszip";
import { writeNativeChart } from "./native-chart";
import { tableGeometry } from "./v06-geometry";
import { validateProject, type Project } from "./project";
import type { TextElement, ShapeElement, LineElement, ImageElement, TableElement } from "./types";

// Browser native PPTX: no upload of the project or dependency on server Python.
// Preserves editable text/shapes/pictures, not strict source-pixel certification.
const A="http://schemas.openxmlformats.org/drawingml/2006/main";
const P="http://schemas.openxmlformats.org/presentationml/2006/main";
const R="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL="http://schemas.openxmlformats.org/package/2006/relationships";
const emu=(n:number)=>String(Math.round(n*9525));
const esc=(s:string)=>s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const hex=(s:string)=>s.slice(1).toUpperCase();
const alpha=(v:number)=>Math.round(Math.max(0,Math.min(1,v))*100000);
const fill=(c:string,o=1)=>`<a:solidFill><a:srgbClr val="${hex(c)}"><a:alpha val="${alpha(o)}"/></a:srgbClr></a:solidFill>`;
const xf=(e:{x:number;y:number;width:number;height:number;rotation:number})=>`<a:xfrm${e.rotation?` rot="${Math.round(e.rotation*60000)}"`:""}><a:off x="${emu(e.x)}" y="${emu(e.y)}"/><a:ext cx="${emu(e.width)}" cy="${emu(e.height)}"/></a:xfrm>`;
const nv=(id:number,name:string,textbox=false)=>`<p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr${textbox?' txBox="1"':""}/><p:nvPr/></p:nvSpPr>`;
function textShape(id:number,e:TextElement){
 const size=Math.max(100,Math.round(e.fontSize*75)),font=esc(e.fontFamily||"Noto Sans KR");
 const style=`lang="ko-KR" sz="${size}" spc="${Math.round(e.letterSpacing*75)}" b="${e.bold?1:0}" i="${e.italic?1:0}"${e.underline?' u="sng"':""}${e.strike?' strike="sngStrike"':""}`;
 const paragraphs=(e.uppercase?e.text.toUpperCase():e.text).replace(/\r\n?/g,"\n").split("\n").map(line=>`<a:p><a:pPr algn="${e.align==="center"?"ctr":e.align==="right"?"r":"l"}"><a:lnSpc><a:spcPct val="${Math.round(e.lineHeight*100000)}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>${line?`<a:r><a:rPr ${style}>${fill(e.fill,e.opacity)}<a:latin typeface="${font}"/><a:ea typeface="${font}"/></a:rPr><a:t xml:space="preserve">${esc(line)}</a:t></a:r>`:""}<a:endParaRPr lang="ko-KR"/></a:p>`).join("");
 return `<p:sp>${nv(id,e.name||`Text ${id}`,true)}<p:spPr>${xf(e)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}
function shapeXml(id:number,e:ShapeElement){
 const geometry=e.type==="ellipse"?"ellipse":e.cornerRadius>0?"roundRect":"rect";
 const line=e.stroke==="transparent"||e.strokeWidth<=0?"<a:ln><a:noFill/></a:ln>":`<a:ln w="${Math.max(1,Math.round(e.strokeWidth*9525))}">${fill(e.stroke,e.opacity)}</a:ln>`;
 return `<p:sp>${nv(id,e.name||`Shape ${id}`)}<p:spPr>${xf(e)}<a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${fill(e.fill,e.opacity)}${line}</p:spPr></p:sp>`;
}
function lineXml(id:number,e:LineElement){
 return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${esc(e.name||`Line ${id}`)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xf(e)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${Math.max(1,Math.round(e.strokeWidth*9525))}">${fill(e.stroke,e.opacity)}${e.dashed?'<a:prstDash val="dash"/>':""}</a:ln></p:spPr></p:cxnSp>`;
}
function picXml(id:number,e:ImageElement,rid:number){
 return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(e.name||`Image ${id}`)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId${rid}"><a:alphaModFix amt="${alpha(e.opacity)}"/></a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xf(e)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}
function tableXml(id:number,e:TableElement){
 const {colW,rowH}=tableGeometry(e),font=esc(e.fontFamily),size=Math.round(e.fontSize*75);
 const rows=Array.from({length:e.rows},(_,r)=>`<a:tr h="${emu(rowH)}">${Array.from({length:e.cols},(_,c)=>{
  const cell=e.cells[r*e.cols+c],header=r===0,color=cell.fill??(header?e.headerFill:e.fill);
  const paragraphs=cell.text.replace(/\r\n?/g,"\n").split("\n").map(t=>`<a:p><a:pPr><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="ko-KR" sz="${size}" b="${header||cell.bold?1:0}">${fill(header?(e.headerTextColor??"#ffffff"):e.textColor,e.opacity)}<a:latin typeface="${font}"/><a:ea typeface="${font}"/></a:rPr><a:t xml:space="preserve">${esc(t)}</a:t></a:r><a:endParaRPr lang="ko-KR" sz="${size}"/></a:p>`).join("");
  const borders=["L","R","T","B"].map(side=>`<a:ln${side} w="${emu(e.borderWidth)}">${e.borderWidth?fill(e.borderColor,e.opacity):"<a:noFill/>"}<a:prstDash val="solid"/></a:ln${side}>`).join("");
  return `<a:tc><a:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs}</a:txBody><a:tcPr marL="${emu(10)}" marR="${emu(10)}" marT="0" marB="0" anchor="ctr">${borders}${color==="transparent"?"<a:noFill/>":fill(color,e.opacity)}</a:tcPr></a:tc>`;
 }).join("")}</a:tr>`).join("");
 return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(e.name||`Table ${id}`)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(e.x)}" y="${emu(e.y)}"/><a:ext cx="${emu(e.width)}" cy="${emu(e.height)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${colW.map(w=>`<a:gridCol w="${emu(w)}"/>`).join("")}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
function bgXml(bg:Project["pages"][number]["background"]){
 const f=bg.type==="solid"?fill(bg.color):`<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${hex(bg.from)}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${hex(bg.to)}"/></a:gs></a:gsLst><a:lin ang="${Math.round(bg.angle*60000)}" scaled="1"/></a:gradFill>`;
 return `<p:bg><p:bgPr>${f}<a:effectLst/></p:bgPr></p:bg>`;
}
const decode=(url:string)=>{const b=url.split(",")[1];if(!b)throw new Error("PPTX 이미지 데이터가 없습니다.");return Uint8Array.from(atob(b),c=>c.charCodeAt(0));};
async function imageData(url:string):Promise<{bytes:Uint8Array;ext:"png"|"jpg"}>{
 if(url.startsWith("data:image/png;"))return {bytes:decode(url),ext:"png"};
 if(url.startsWith("data:image/jpeg;"))return {bytes:decode(url),ext:"jpg"};
 if(!url.startsWith("data:image/webp;")||typeof document==="undefined")throw new Error("지원하지 않는 PPTX 이미지 형식입니다.");
 const im=new Image(); im.src=url; await im.decode();
 const cv=document.createElement("canvas");cv.width=im.naturalWidth;cv.height=im.naturalHeight;
 const ctx=cv.getContext("2d");if(!ctx)throw new Error("이미지를 PNG로 변환할 수 없습니다.");
 ctx.drawImage(im,0,0);return {bytes:decode(cv.toDataURL("image/png")),ext:"png"};
}
const tree='<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
export async function exportNativePPTX(input:Project,templateBytes?:Uint8Array):Promise<Blob>{
 const project=validateProject(input);
 if(project.pages.some(p=>p.elements.some(e=>e.visible&&(e.type==="table"||e.type==="chart")&&e.rotation!==0)))
  throw new Error("실험용 편집형 PPTX는 회전한 표·차트를 지원하지 않습니다. 발표용 PPTX를 사용하세요.");
 let binary=templateBytes;
 if(!binary){const response=await fetch("/native-pptx-template.pptx");if(!response.ok)throw new Error("PPTX 템플릿을 불러올 수 없습니다.");binary=new Uint8Array(await response.arrayBuffer());}
 const zip=await JSZip.loadAsync(binary);
 let presentation=await zip.file("ppt/presentation.xml")!.async("string");
 const relations=await zip.file("ppt/_rels/presentation.xml.rels")!.async("string");
 let ct=await zip.file("[Content_Types].xml")!.async("string");
 const id=Math.max(2,...[...relations.matchAll(/Id="rId(\d+)"/g)].map(m=>Number(m[1])))+1;
 presentation=presentation.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,`<p:sldIdLst>${project.pages.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${id+i}"/>`).join("")}</p:sldIdLst>`)
  .replace(/<p:sldSz\b[^>]*\/>/,`<p:sldSz cx="${emu(project.width)}" cy="${emu(project.height)}" type="cust"/>`);
 zip.file("ppt/presentation.xml",presentation);
 const rs=project.pages.map((_,i)=>`<Relationship Id="rId${id+i}" Type="${R}/slide" Target="slides/slide${i+1}.xml"/>`).join("");
 zip.file("ppt/_rels/presentation.xml.rels",relations.replace(/<Relationship(?=[^>]*Type="[^"]*\/slide")[^>]*\/>/g,"").replace("</Relationships>",rs+"</Relationships>"));
 for(const ext of ["png","jpg"])if(!ct.includes(`Extension="${ext}"`))ct=ct.replace("</Types>",`<Default Extension="${ext}" ContentType="image/${ext==="jpg"?"jpeg":ext}"/></Types>`);
 const additional=project.pages.slice(1).map((_,i)=>`<Override PartName="/ppt/slides/slide${i+2}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
 zip.file("[Content_Types].xml",ct.replace("</Types>",additional+"</Types>"));
 const sourceRel=await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("string");
 const layoutRel=sourceRel.match(/<Relationship(?=[^>]*Type="[^"]*\/slideLayout")[^>]*\/>/)?.[0];
 if(!layoutRel)throw new Error("PPTX 슬라이드 레이아웃이 없습니다.");
 const media=new Map<string,string>();let num=0;
 for(let pageNo=0;pageNo<project.pages.length;pageNo++){
  const page=project.pages[pageNo];let elements="",rid=100;const imgrels:string[]=[];
  for(const [idx,e] of page.elements.entries()){
   if(!e.visible)continue;
   const shapeId=idx+2;
   if(e.type==="text")elements+=textShape(shapeId,e);
   else if(e.type==="rect"||e.type==="ellipse")elements+=shapeXml(shapeId,e);
   else if(e.type==="line")elements+=lineXml(shapeId,e);
   else if(e.type==="table")elements+=tableXml(shapeId,e);
   else if(e.type==="chart"){
    const name=`chart-${pageNo+1}-${shapeId}`;
    const override=await writeNativeChart(zip,e,name);
    let contentTypes=await zip.file("[Content_Types].xml")!.async("string");
    if(!contentTypes.includes('Extension="xlsx"'))contentTypes=contentTypes.replace("</Types>",'<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/></Types>');
    zip.file("[Content_Types].xml",contentTypes.replace("</Types>",override+"</Types>"));
    imgrels.push(`<Relationship Id="rId${rid}" Type="${R}/chart" Target="../charts/${name}.xml"/>`);
    elements+=`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${shapeId}" name="${esc(e.name||"Chart")}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(e.x)}" y="${emu(e.y)}"/><a:ext cx="${emu(e.width)}" cy="${emu(e.height)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${rid++}"/></a:graphicData></a:graphic></p:graphicFrame>`;
   }
   else if(e.type==="image"){
    if(!e.assetId||!project.assets[e.assetId])throw new Error("PPTX 이미지 에셋을 찾을 수 없습니다.");
    let name=media.get(e.assetId);
    if(!name){const dat=await imageData(project.assets[e.assetId].dataUrl);name=`studio-${++num}.${dat.ext}`;zip.file("ppt/media/"+name,dat.bytes);media.set(e.assetId,name);}
    imgrels.push(`<Relationship Id="rId${rid}" Type="${R}/image" Target="../media/${name}"/>`);
    elements+=picXml(shapeId,e,rid++);
   }else throw new Error("PPTX에서 지원하지 않는 레이어: "+e.type);
  }
  zip.file(`ppt/slides/slide${pageNo+1}.xml`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${A}" xmlns:p="${P}" xmlns:r="${R}"><p:cSld>${bgXml(page.background)}${tree}${elements}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
  zip.file(`ppt/slides/_rels/slide${pageNo+1}.xml.rels`,`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL}">${layoutRel}${imgrels.join("")}</Relationships>`);
 }
 return zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:5}});
}
