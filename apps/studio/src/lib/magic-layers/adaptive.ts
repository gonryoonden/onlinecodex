import { z } from 'zod';
import type { Asset } from '../project';
import { loadImage } from '../imports';
import { analysisSchema, regionSchema, type Analysis, type Region } from './schema';
import { detectLocalImages } from './local-detect';
export type Attempt={method:'adaptive'|'legacy'|'gemini';result:'ok'|'empty'|'error';added:number};
export interface PipelineResult {analysis:Analysis;attempts:Attempt[];protected:number;warnings:string[];route:'flat'|'complex';}
/** All existing regions (including user's OCR/masks) are immutable inputs.
 * New overlapping/duplicate-ID regions are proposals we omit, not replacements. */
export function mergeRegions(existing:Region[],incoming:Region[]){
 const result=[...existing];let protectedCount=0;
 for(const r of incoming){
  const area=r.bbox[2]*r.bbox[3];
  if(result.length>=80||result.some(e=>e.id===r.id)||existing.some(e=>Math.max(0,Math.min(e.bbox[0]+e.bbox[2],r.bbox[0]+r.bbox[2])-Math.max(e.bbox[0],r.bbox[0]))*Math.max(0,Math.min(e.bbox[1]+e.bbox[3],r.bbox[1]+r.bbox[3])-Math.max(e.bbox[1],r.bbox[1]))>Math.min(area,e.bbox[2]*e.bbox[3])*.1)){protectedCount++;continue;}
  result.push(r);
 }
 return {regions:result,protectedCount};
}
export function flatPerimeter(data:Uint8ClampedArray,w:number,h:number){
 const border:number[][]=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x===0||y===0||x===w-1||y===h-1)border.push(Array.from(data.subarray((y*w+x)*4,(y*w+x)*4+4)));
 if(!border.length)return false;
 const color=[0,1,2].map(c=>border.map(p=>p[c]).sort((a,b)=>a-b)[Math.floor(border.length/2)]);
 return border.filter(p=>p[3]===255&&color.every((v,c)=>Math.abs(v-p[c])<=6)).length/border.length>=.99;
}
export async function profileSource(source:Asset,signal:AbortSignal){
 signal.throwIfAborted();const image=await loadImage(source.dataUrl);signal.throwIfAborted();
 const c=document.createElement('canvas'),scale=Math.min(1,192/Math.max(source.width,source.height));c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));const x=c.getContext('2d',{willReadFrequently:true})!;x.drawImage(image,0,0,c.width,c.height);return flatPerimeter(x.getImageData(0,0,c.width,c.height).data,c.width,c.height);
}
/** At most three distinct stages, one AI request (server's existing quota cap
 * still applies). No new AI after a failure; cancellation discards all proposals. */
export async function adaptivePipeline(options:{existing:Analysis;flat:boolean;allowAI:boolean;signal:AbortSignal;local:(method:'adaptive'|'legacy',existing:Region[])=>Promise<Region[]>;ai:()=>Promise<Analysis>;onStage?:(stage:Attempt['method'])=>void;inspect?:(regions:Region[])=>Promise<{regions:Region[];rejected:number;edgeRisk:number}>}):Promise<PipelineResult>{
 const {signal}=options;let analysis=analysisSchema.safeExtend({regions:z.array(regionSchema).max(80)}).parse(options.existing),protectedCount=0;const attempts:Attempt[]=[],warnings:string[]=[];
 const methods:Attempt['method'][]=options.flat?['adaptive',...(options.allowAI?['gemini' as const]:[]),'legacy']:[...(options.allowAI?['gemini' as const]:[]),'adaptive','legacy'];
 for(const method of methods){
  signal.throwIfAborted();options.onStage?.(method);
  try{
   let incoming=method==='gemini'?analysisSchema.parse(await options.ai()):{...analysis,regions:await options.local(method,analysis.regions)};
   if(options.inspect){const checked=await options.inspect(incoming.regions);incoming={...incoming,regions:checked.regions};if(checked.rejected)warnings.push(`비어 있거나 전경이 과도한 마스크 ${checked.rejected}개를 제외했습니다. 원본에서 해당 영역을 다시 지정하세요.`);if(checked.edgeRisk)warnings.push('일부 마스크가 영역 가장자리에 닿습니다. 잘림과 배경 혼입을 검토하세요.');}
   signal.throwIfAborted();const previousImages=analysis.regions.filter(r=>r.type==='image').length;const merged=mergeRegions(analysis.regions,incoming.regions),added=merged.regions.length-analysis.regions.length;
   protectedCount+=merged.protectedCount;analysis={...analysis,regions:merged.regions};
   if(method==='gemini'&&options.existing.regions.length===0)analysis={...incoming,regions:merged.regions};
   attempts.push({method,result:added?'ok':'empty',added});
   if(analysis.regions.filter(r=>r.type==='image').length>previousImages)break;
  }catch{signal.throwIfAborted();attempts.push({method,result:'error',added:0});}
 }
 if(!analysis.regions.some(r=>r.type==='image'))warnings.push('이미지 객체를 찾지 못했습니다. 원본을 유지하고 이미지 영역을 직접 지정하세요.');
 if(protectedCount)warnings.push('기존 영역과 겹치는 새 후보는 적용하지 않았습니다. 수동 교정 내용이 유지됩니다.');
 if(analysis.regions.some(r=>r.type==='text'))warnings.push('한글·숫자는 원문과 비교해 교정하세요. OCR 정확도는 자동 보증하지 않습니다.');
 if(analysis.regions.some(r=>r.type==='image'&&!r.maskPng&&!r.polygon))warnings.push('마스크 없는 이미지는 사각형 근사 크롭입니다. 정확한 객체 분리가 아닙니다.');
 warnings.push('적용 전 미리보기와 이동·삭제 후 배경을 확인하세요. 숨은 객체 누락과 배경 잔상은 자동 확정할 수 없습니다.');
 return {analysis,attempts,protected:protectedCount,warnings,route:options.flat?'flat':'complex'};
}
export function localProposal(source:Asset,method:'adaptive'|'legacy',existing:Region[],signal:AbortSignal,onProgress?:(n:number)=>void){return detectLocalImages(source,existing,signal,onProgress,method);}
/** Structural mask screening only. It cannot certify semantic object boundaries. */
export function maskHealth(values:Uint8Array,w:number,h:number){
 let foreground=0,border=0,covered=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=values[y*w+x]>127;if(v)foreground++;if(!x||!y||x===w-1||y===h-1){border++;if(v)covered++;}}
 const coverage=foreground/(w*h);return {reject:coverage<.005||coverage>.98,edgeRisk:border>0&&covered/border>.25,coverage};
}
export async function inspectMasks(regions:Region[],signal:AbortSignal){
 const kept:Region[]=[];let rejected=0,edgeRisk=0;
 for(const r of regions){signal.throwIfAborted();if(!r.maskPng){kept.push(r);continue;}
  const im=await loadImage(r.maskPng);signal.throwIfAborted();if(im.naturalWidth*im.naturalHeight>4194304){rejected++;continue;}
  const c=document.createElement('canvas'),scale=Math.min(1,256/Math.max(im.naturalWidth,im.naturalHeight));c.width=Math.max(1,Math.round(im.naturalWidth*scale));c.height=Math.max(1,Math.round(im.naturalHeight*scale));const x=c.getContext('2d',{willReadFrequently:true})!;x.drawImage(im,0,0,c.width,c.height);const d=x.getImageData(0,0,c.width,c.height).data,v=new Uint8Array(c.width*c.height);for(let i=0;i<v.length;i++)v[i]=Math.round(d[i*4]*d[i*4+3]/255);const health=maskHealth(v,c.width,c.height);
  if(health.reject)rejected++;else{kept.push(r);if(health.edgeRisk)edgeRisk++;}
 }
 return {regions:kept,rejected,edgeRisk};
}
