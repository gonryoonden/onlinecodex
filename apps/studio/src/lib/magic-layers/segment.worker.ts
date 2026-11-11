import * as ort from 'onnxruntime-web/wasm';
type Input={data:Float32Array;boxes:{id:string;coords:number[]}[]};
const scope=self as unknown as {location:Location;onmessage:((e:MessageEvent<Input>)=>void)|null;postMessage:(v:unknown,t?:Transferable[])=>void};
scope.onmessage=async e=>{
 try{
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=`${scope.location.origin}/sam/ort/`;ort.env.logLevel='error';
  scope.postMessage({stage:'download'});
  const response=await fetch('/sam/manifest.json');if(!response.ok)throw new Error('분할 모델 목록을 불러오지 못했습니다.');
  const manifest=await response.json();
  const read=async(name:string)=>{const r=await fetch(`/sam/${name}`);if(!r.ok)throw new Error(`분할 모델 다운로드 실패 (${r.status})`);const bytes=await r.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
   if(bytes.byteLength!==manifest.files[name].bytes||hash!==manifest.files[name].sha256)throw new Error('분할 모델 무결성 오류');return bytes;};
  const [encoder,decoder]=await Promise.all([read('encoder.onnx'),read('decoder.onnx')]);
  const enc=await ort.InferenceSession.create(encoder,{executionProviders:['wasm']}),dec=await ort.InferenceSession.create(decoder,{executionProviders:['wasm']});
  scope.postMessage({stage:'encode'});const start=performance.now();
  const encoded=await enc.run({image:new ort.Tensor('float32',e.data.data,[1,3,1024,1024])});const embedding=encoded.embedding;await enc.release();
  for(const [i,box] of e.data.boxes.entries()){
   const output=await dec.run({embedding,coords:new ort.Tensor('float32',new Float32Array(box.coords),[1,2,2]),labels:new ort.Tensor('float32',new Float32Array([2,3]),[1,2])});
   const scores=output.scores.data as Float32Array;let best=1;for(let k=2;k<4;k++)if(scores[k]>scores[best])best=k;
   const logits=new Float32Array((output.masks.data as Float32Array).slice(best*65536,(best+1)*65536));
   scope.postMessage({stage:'mask',id:box.id,score:scores[best],logits,completed:i+1,total:e.data.boxes.length},[logits.buffer]);
   for(const tensor of Object.values(output))tensor.dispose();
  }
  embedding.dispose();await dec.release();scope.postMessage({stage:'done',elapsedMs:performance.now()-start,revision:manifest.upstreamRevision});
 }catch(error){scope.postMessage({stage:'error',message:error instanceof Error?error.message:'기기 분할 실패'});}
};
