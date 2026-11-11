import {it,expect} from 'vitest';
import {bilinear,imageSize,upsampleLogits} from '../src/lib/magic-layers/sam-math';
it('preserves aspect ratio for portrait/landscape originals and half-pixel edge samples',()=>{
 expect(imageSize(2752,1536)).toEqual({width:1024,height:572});expect(imageSize(1701,9921)).toEqual({width:176,height:1024});
 expect(bilinear(new Float32Array([0,10,20,30]),2,2,.5,.5)).toBe(15);expect(bilinear(new Float32Array([0,10,20,30]),2,2,-.5,-.5)).toBe(0);
});
it('does not invent foreground from constant negative logits or accept wrong model shape',()=>{
 expect(()=>upsampleLogits(new Float32Array(10))).toThrow();const values=upsampleLogits(new Float32Array(65536).fill(-4));expect(values[0]).toBe(-4);expect(values[1048575]).toBe(-4);
});
