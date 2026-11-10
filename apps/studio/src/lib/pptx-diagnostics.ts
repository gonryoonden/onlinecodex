import JSZip from "jszip";
import type { Project } from "./project";
import { elementItems, snapshotStage, withLiveStages, type Diagnostic, type TraceItem } from "./magic-layers/diagnostics";
/** Verify actual emitted OOXML, not merely the number of loop iterations. Native
 * exporter uses original element index + 2 as cNvPr id (hidden elements leave gaps). */
export async function verifyNativePptx(blob: Blob, project: Project): Promise<Record<string,Diagnostic>> {
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const reports:Record<string,Diagnostic>={};
  for(const [pageIndex,page] of project.pages.entries()) {
    const entry=zip.file(`ppt/slides/slide${pageIndex+1}.xml`);
    if(!entry)throw new Error(`PPTX 페이지 누락: ${pageIndex+1}`);
    const xml=await entry.async("string"), actual:TraceItem[]=[];
    const blocks=[...xml.matchAll(/<p:(sp|pic|cxnSp|graphicFrame)>([\s\S]*?)<\/p:\1>/g)];
    for(const [,tag,body] of blocks){
      const n=Number(body.match(/<p:cNvPr\s+id="(\d+)"/)?.[1]);
      const el=page.elements[n-2];
      if(tag==="graphicFrame" && !((el?.type==="table"&&body.includes('uri="http://schemas.openxmlformats.org/drawingml/2006/table"')&&body.includes("<a:tbl>"))||(el?.type==="chart"&&body.includes("<c:chart "))))throw new Error("PPTX 표·차트 구조 불일치");
      const type=tag==="pic"?"image":body.includes("<p:txBody>")?"text":"shape";
      if(!el||!el.visible||elementItems([el])[0].type!==type)throw new Error("PPTX 객체 ID·유형 대응 불일치");
      if(el.type==="table") {
        const cells=[...body.matchAll(/<a:tc>([\s\S]*?)<\/a:tc>/g)];
        if(cells.length!==el.rows*el.cols||(body.match(/<a:tr /g)||[]).length!==el.rows)throw new Error("PPTX 표 셀 누락");
      }
      if(el.type==="chart") {
        const chart=zip.file(`ppt/charts/chart-${pageIndex+1}-${n}.xml`),book=zip.file(`ppt/embeddings/chart-${pageIndex+1}-${n}.xlsx`);
        if(!chart||!book)throw new Error("PPTX 차트 데이터 누락");
        const cx=await chart.async("string"),cache=cx.match(/<c:numCache>([\s\S]*?)<\/c:numCache>/)?.[1];
        const values=[...(cache??"").matchAll(/<c:v>([^<]+)<\/c:v>/g)].map(m=>Number(m[1]));
        if(values.length!==el.data.length||values.some((v,i)=>v!==el.data[i].value))throw new Error("PPTX 차트 값 불일치");
      }
      actual.push({...elementItems([el])[0],type});
    }
    const expected=page.elements.filter(e=>e.visible);
    if(actual.length!==expected.length||new Set(actual.map(o=>o.id)).size!==expected.length)throw new Error("저장된 표시 객체와 PPTX 객체 수 불일치");
    const trace=project.diagnostics?.[page.id];
    if(trace) {
      const updated=withLiveStages(trace,page.elements,"visible-export");
      reports[page.id]={...updated,warnings:updated.warnings.filter(w=>w!=="PPTX_SNAPSHOT_DIFFERS"),pptxVerifiedAt:new Date().toISOString(),stages:[...updated.stages.filter(s=>s.name!=="pptx"),snapshotStage("pptx",actual)]};
    }
  }
  return reports;
}
