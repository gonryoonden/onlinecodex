import {it,expect} from 'vitest';
import {reconcileCandidates} from '../src/lib/magic-layers/candidates';
import {diagnosticSchema} from '../src/lib/magic-layers/diagnostics';
import type {Region} from '../src/lib/magic-layers/schema';
const card:Region={id:'card',type:'shape',shape:'rect',bbox:[0,0,800,800],zIndex:0,review:true};
const text:Region={id:'text',type:'text',text:'한글',bbox:[100,100,100,100],zIndex:1,review:true};
it('merges true duplicates but preserves native parent/child identity and all input IDs',()=>{
 const r=reconcileCandidates([card,text,{...text,id:'duplicate'}, {...text,id:'different',text:'다른 내용'}],[]);
 expect(r.canonical.map(r=>r.id)).toEqual(['card','text','different']);
 expect(r.outcomes).toHaveLength(4);expect(r.outcomes.find(o=>o.id==='duplicate')).toMatchObject({status:'merged',canonicalId:'text'});
 expect(r.outcomes.find(o=>o.id==='text')).toMatchObject({parentId:'card',status:'correction-needed'});
});
it('preserves exclusion without merging it into a canonical object',()=>{
 const r=reconcileCandidates([text,{...text,id:'keep'}],['text']);expect(r.outcomes[0].status).toBe('user-excluded');expect(r.canonical[0].id).toBe('keep');
});
it('new optional inventory remains schemaVersion-1 diagnostic compatible',()=>{
 expect(diagnosticSchema.shape.candidates.parse(reconcileCandidates([text],[]).outcomes)).toHaveLength(1);
});

it('allocates native text and card even with NO repair, hides them and persists their inventory',async()=>{
 const {reconstructIndependent}=await import('../src/lib/magic-layers/independent');
 const {createTextElement,createShapeElement,createPage}=await import('../src/lib/types');
 const {newProject,validateProject}=await import('../src/lib/project');
 const source={id:'source',name:'input.png',mime:'image/png' as const,dataUrl:'data:image/png;base64,AAAA',width:100,height:100,original:true};
 const input={background:{kind:'complex' as const,from:'#ffffff',to:'#ffffff',angle:0},regions:[card,text],notes:''};
 const result=await reconstructIndependent(input,source,100,100,[],'saved-gemini',async a=>({page:{...createPage(),elements:a.regions.map(r=>({...r.type==='text'?createTextElement({text:r.text}):createShapeElement('rect'),provenance:{source:'source',regionId:r.id,method:'native',review:true}}))},assets:[],warnings:[],diagnostic:{} as never}));
 expect(result.page.elements.filter(e=>e.provenance?.regionId)).toHaveLength(2);
 expect(result.page.elements.filter(e=>e.provenance?.regionId).every(e=>!e.visible)).toBe(true);
 expect(result.diagnostic.candidates?.every(o=>o.elementId&&o.status==='correction-needed')).toBe(true);
 const p=newProject();p.assets.source=source;p.pages=[result.page];p.diagnostics={[result.page.id]:result.diagnostic};
 expect(validateProject(p).diagnostics?.[result.page.id].candidates).toEqual(result.diagnostic.candidates);
});
