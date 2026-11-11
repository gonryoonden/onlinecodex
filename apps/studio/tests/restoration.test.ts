import {it,expect} from 'vitest';
import {writeRepair} from '../src/lib/magic-layers/restoration';
it('replaces original ink only inside extracted alpha support and preserves all other pixels',()=>{
 const data=new Uint8ClampedArray(20*20*4).fill(100),before=data.slice();
 const alpha=new Uint8Array(8*8);for(let y=2;y<6;y++)for(let x=2;x<6;x++)alpha[y*8+x]=128;
 writeRepair(data,20,20,{id:'icon',rect:[4,4,8,8],color:[250,251,252]},{alpha,x:4,y:4,width:8,height:8});
 for(let y=0;y<20;y++)for(let x=0;x<20;x++){const p=(y*20+x)*4;
  expect([...data.slice(p,p+4)]).toEqual(x>=6&&x<10&&y>=6&&y<10?[250,251,252,255]:[...before.slice(p,p+4)]);
 }
});
