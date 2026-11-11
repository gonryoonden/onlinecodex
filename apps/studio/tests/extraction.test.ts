import {it,expect} from 'vitest';
import {polygonCoverage,extractAlphaCandidates} from '../src/lib/magic-layers/extraction';
import type {Region} from '../src/lib/magic-layers/schema';
import {reconcileCandidates} from '../src/lib/magic-layers/candidates';
const r:Region={id:'image',type:'image',bbox:[100,100,200,200],zIndex:0,review:true};
it('does not certify a rectangular crop as a successful alpha polygon',async()=>{
 const rectangle={...r,polygon:[[100,100],[300,100],[300,300],[100,300]] as [number,number][]};
 expect(polygonCoverage(rectangle)).toBe(1);
 const {outcomes}=reconcileCandidates([rectangle],[]);
 expect(await extractAlphaCandidates({} as never,[rectangle],outcomes)).toEqual([]);
 expect(outcomes[0]).toMatchObject({status:'separation-failed',reason:'polygon-empty-or-opaque'});
});
it('retains a nonrectangular explicit mask as reviewable extraction',async()=>{
 const diamond={...r,polygon:[[200,100],[300,200],[200,300],[100,200]] as [number,number][]};
 const {outcomes}=reconcileCandidates([diamond],[]);
 expect(await extractAlphaCandidates({} as never,[diamond],outcomes)).toEqual([diamond]);
 expect(outcomes[0].extraction).toBe('polygon');
});
