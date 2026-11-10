import { describe,it,expect,vi } from 'vitest';
import { adaptivePipeline,mergeRegions,flatPerimeter,maskHealth } from '../src/lib/magic-layers/adaptive';
import type { Analysis,Region } from '../src/lib/magic-layers/schema';
const analysis:Analysis={background:{kind:'solid',from:'#ffffff',to:'#ffffff',angle:0},regions:[],notes:''};
const region=(id:string,x=100):Region=>({id,type:'image',bbox:[x,100,100,100],zIndex:0,review:true});
describe('bounded adaptive planning',()=>{
 it('keeps manual text, masks, coordinates, style and excludes overlapping AI suggestions',()=>{
  const old={...region('old'),type:'text' as const,text:'사용자 교정 16시간',style:{color:'#123456',lineHeight:1.5}};
  const merged=mergeRegions([old],[region('other'),region('new',400)]);expect(merged.regions[0]).toBe(old);expect(merged.regions).toHaveLength(2);expect(merged.protectedCount).toBe(1);
 });
 it('flat background uses one local path, without an AI call even if consent exists',async()=>{
  const ai=vi.fn(),local=vi.fn().mockResolvedValue([region('icon')]);const result=await adaptivePipeline({existing:analysis,flat:true,allowAI:true,signal:new AbortController().signal,ai,local});expect(ai).not.toHaveBeenCalled();expect(local).toHaveBeenCalledTimes(1);expect(result.attempts).toHaveLength(1);
 });
 it('AI error falls back locally without retrying AI or replacing corrected text',async()=>{
  const ai=vi.fn().mockRejectedValue(new Error('PRIVATE SERVER CONTENT'));
  const local=vi.fn().mockResolvedValue([region('icon',400)]);
  const result=await adaptivePipeline({existing:{...analysis,regions:[{...region('manual'),type:'text',text:'원문 교정'}]},flat:false,allowAI:true,signal:new AbortController().signal,ai,local});expect(ai).toHaveBeenCalledTimes(1);expect(result.attempts.map(a=>a.method)).toEqual(['gemini','adaptive']);expect(JSON.stringify(result)).not.toContain('PRIVATE SERVER');expect(result.analysis.regions[0].text).toBe('원문 교정');
 });
 it('no consent means no AI and at most two distinct local attempts on failure',async()=>{
  const ai=vi.fn(),local=vi.fn().mockResolvedValue([]);const result=await adaptivePipeline({existing:analysis,flat:false,allowAI:false,signal:new AbortController().signal,ai,local});expect(ai).not.toHaveBeenCalled();expect(local.mock.calls.map(a=>a[0])).toEqual(['adaptive','legacy']);expect(result.analysis.regions).toHaveLength(0);
 });
 it('cancellation stops fallback and never returns partial proposals',async()=>{
  const abort=new AbortController(),local=vi.fn().mockImplementation(async()=>{abort.abort();return [region('late')];});await expect(adaptivePipeline({existing:analysis,flat:true,allowAI:true,signal:abort.signal,local,ai:vi.fn()})).rejects.toThrow();expect(local).toHaveBeenCalledTimes(1);
 });
 it('profile is conservative on transparency and nonuniform perimeter',()=>{
  const p=new Uint8ClampedArray(20*20*4).fill(255);expect(flatPerimeter(p,20,20)).toBe(true);for(let i=0;i<20;i++)p[i*4]=0;expect(flatPerimeter(p,20,20)).toBe(false);
 });
});

it('mask screening rejects empty/full masks and flags clipped boundaries separately',()=>{
 const empty=new Uint8Array(100),full=new Uint8Array(100).fill(255);
 expect(maskHealth(empty,10,10).reject).toBe(true);expect(maskHealth(full,10,10).reject).toBe(true);
 const centered=new Uint8Array(100);for(let y=2;y<8;y++)for(let x=2;x<8;x++)centered[y*10+x]=255;
 expect(maskHealth(centered,10,10)).toMatchObject({reject:false,edgeRisk:false,coverage:.36});
 const clipped=new Uint8Array(100);for(let i=0;i<50;i++)clipped[i]=255;expect(maskHealth(clipped,10,10)).toMatchObject({reject:false,edgeRisk:true});
});
it('invalid mask candidates trigger the next bounded fallback',async()=>{
 const local=vi.fn().mockResolvedValue([region('bad')]);const inspect=vi.fn().mockResolvedValue({regions:[],rejected:1,edgeRisk:0});
 const result=await adaptivePipeline({existing:analysis,flat:true,allowAI:false,signal:new AbortController().signal,ai:vi.fn(),local,inspect});
 expect(result.attempts).toHaveLength(2);expect(result.analysis.regions).toEqual([]);expect(result.warnings.join(' ')).toContain('마스크');
});
it('preserves legitimate overlap within one AI response while protecting only pre-existing regions',()=>{
 const incoming=[region('outer'),{...region('inner'),bbox:[120,120,30,30] as Region['bbox']}];
 expect(mergeRegions([],incoming).regions).toEqual(incoming);
 expect(mergeRegions([region('manual')],incoming).regions).toHaveLength(1);
});
