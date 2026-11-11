import {analysisSchema} from './schema';
import {stageSchema,type Diagnostic} from './diagnostics';
import {prepareAiImageWithMetadata,readApiJson} from '../ai-transport';
import type {PageData} from '../types';
import type {Asset} from '../project';
import {reconstructDesign} from './reconstruct';
export type SavedAnalysis=NonNullable<PageData['magicReview']>;
const cache=new Map<string,SavedAnalysis>();
export async function sourceKey(source:Asset){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source.dataUrl)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function cachedAnalysis(key:string){return cache.get(key);}
export function rememberAnalysis(key:string,value:SavedAnalysis){cache.set(key,value);if(cache.size>8)cache.delete(cache.keys().next().value!);}
export async function automaticEdit(options:{source:Asset;width:number;height:number;consent:boolean;saved?:SavedAnalysis;signal:AbortSignal;progress:(s:string)=>void;persist:(v:SavedAnalysis)=>void}){
 const {source,signal,progress}=options,key=await sourceKey(source);signal.throwIfAborted();
 let saved=options.saved??cachedAnalysis(key),initial:Partial<Diagnostic>={};
 if(!saved){
  if(!options.consent)throw new Error('이 이미지의 외부 Gemini 전송 동의가 필요합니다.');
  progress('AI 연결 확인');const capabilities=await readApiJson(await fetch('/api/capabilities',{signal}));
  if(!capabilities.enabled)throw new Error(capabilities.reason??'AI 연결을 확인할 수 없습니다.');
  progress('Gemini 이미지 분석 중');const {image,transport}=await prepareAiImageWithMetadata(source.dataUrl);signal.throwIfAborted();
  const response=await fetch('/api/ai/magic-layers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,consent:true}),signal});const data=await readApiJson(response);
  if(!response.ok)throw new Error(data.error??'이미지 분석 실패');
  const parsed=analysisSchema.parse(data.analysis);
  saved={sourceId:source.id,analysis:{...parsed,regions:parsed.regions.map(r=>({...r,manualBackground:undefined,maskOrigin:r.maskPng||r.polygon?'analysis':undefined}))},skip:[],provider:`gemini/${data.provenance.model}`};
  initial={transport,stages:data.trace?.stages?stageSchema.array().parse(data.trace.stages):undefined};
  // Cache and persist immediately: a later model cancellation must not repeat Gemini.
  rememberAnalysis(key,saved);options.persist(saved);
 }
 signal.throwIfAborted();progress(`분석 후보 ${saved.analysis.regions.length}개 · 객체 분리`);
 if(saved.analysis.regions.some(r=>r.type==='image'&&!r.maskPng&&!r.polygon&&!saved!.skip.includes(r.id))){
  const {segmentObjects}=await import('./segment');
  const result=await segmentObjects(source,saved.analysis.regions.filter(r=>!saved!.skip.includes(r.id)),signal,progress);
  const changes=new Map(result.regions.map(r=>[r.id,r]));saved={...saved,analysis:{...saved.analysis,regions:saved.analysis.regions.map(r=>changes.get(r.id)??r)}};
  rememberAnalysis(key,saved);options.persist(saved);
 }
 signal.throwIfAborted();progress('마스크 품질·배경 보호 검사 및 레이어 생성');
 const result=await reconstructDesign(saved.analysis,source,options.width,options.height,saved.skip,false,saved.provider,undefined,{mode:'independent',automatic:true,initial});
 signal.throwIfAborted();return result;
}
