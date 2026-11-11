#!/usr/bin/env python3
import os,sys
runtime=os.environ.get('STUDIO_SEGMENT_PYTHON')
if runtime and os.path.abspath(sys.executable)!=os.path.abspath(runtime):os.execv(runtime,[runtime,__file__])
import json,hashlib,time,shutil
from pathlib import Path
import numpy as np,torch,onnxruntime as ort
from PIL import Image
repo=Path(os.environ['STUDIO_MOBILE_SAM_REPO']);sys.path.insert(0,str(repo))
from mobile_sam import sam_model_registry,SamPredictor
from mobile_sam.utils.onnx import SamOnnxModel
ROOT=Path(__file__).resolve().parents[2];out=ROOT/'apps/studio/public/sam';out.mkdir(parents=True,exist_ok=True)
weight=repo/'weights/mobile_sam.pt';assert hashlib.sha256(weight.read_bytes()).hexdigest()=='6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f'
torch.set_num_threads(2);model=sam_model_registry['vit_t'](checkpoint=str(weight)).eval()
class Decoder(torch.nn.Module):
 def __init__(self,model):super().__init__();self.onnx=SamOnnxModel(model,return_single_mask=False)
 def forward(self,image_embeddings,point_coords,point_labels):
  sparse=self.onnx._embed_points(point_coords,point_labels)
  dense=self.onnx.model.prompt_encoder.no_mask_embed.weight.reshape(1,-1,1,1).expand(1,-1,64,64)
  return self.onnx.model.mask_decoder.predict_masks(image_embeddings=image_embeddings,image_pe=self.onnx.model.prompt_encoder.get_dense_pe(),sparse_prompt_embeddings=sparse,dense_prompt_embeddings=dense)
decoder=Decoder(model).eval();coords=torch.tensor([[[200.,200.],[400.,400.]]]);labels=torch.tensor([[2.,3.]])
with torch.inference_mode():
 torch.onnx.export(model.image_encoder,torch.zeros(1,3,1024,1024),out/'encoder.onnx',opset_version=17,input_names=['image'],output_names=['embedding'],dynamo=False)
 torch.onnx.export(decoder,(torch.zeros(1,256,64,64),coords,labels),out/'decoder.onnx',opset_version=17,input_names=['embedding','coords','labels'],output_names=['masks','scores'],dynamo=False)
image=np.array(Image.open(ROOT/'2024년_산업안전보건교육_주요_개정_요약.png').convert('RGB'));predictor=SamPredictor(model);predictor.set_image(image)
transformed=predictor.transform.apply_image(image);tensor=torch.as_tensor(transformed).permute(2,0,1)[None];normalized=model.preprocess(tensor).numpy()
options=ort.SessionOptions();options.intra_op_num_threads=2
enc=ort.InferenceSession(str(out/'encoder.onnx'),sess_options=options,providers=['CPUExecutionProvider']);dec=ort.InferenceSession(str(out/'decoder.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
start=time.perf_counter();embedding=enc.run(None,{'image':normalized})[0];elapsed=time.perf_counter()-start;difference=float(np.max(np.abs(embedding-predictor.features.numpy())));assert difference<.003,difference
H,W=image.shape[:2];box=np.array([271/1000*W,799/1000*H,330/1000*W,928/1000*H]);transformedBox=predictor.transform.apply_boxes(box[None],(H,W)).reshape(1,2,2).astype('float32')
with torch.inference_mode():reference=decoder(predictor.features,torch.from_numpy(transformedBox),labels)
result=dec.run(None,{'embedding':embedding,'coords':transformedBox,'labels':labels.numpy()});maskDiff=float(np.max(np.abs(result[0]-reference[0].numpy())));scoreDiff=float(np.max(np.abs(result[1]-reference[1].numpy())));assert maskDiff<.01 and scoreDiff<.001,(maskDiff,scoreDiff)
manifest={'model':'MobileSAM-vit_t','upstreamRevision':'f706ad9c4eb7f219c00d9050e46328518ffb65d2','checkpointSHA256':hashlib.sha256(weight.read_bytes()).hexdigest(),'license':'Apache-2.0','opset':17,'runtime':'onnxruntime-web@1.21.0','normalization':{'mean':[123.675,116.28,103.53],'std':[58.395,57.12,57.375]},'files':{n:{'sha256':hashlib.sha256((out/n).read_bytes()).hexdigest(),'bytes':(out/n).stat().st_size} for n in ['encoder.onnx','decoder.onnx']}}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');shutil.copy2(repo/'LICENSE',out/'LICENSE-MobileSAM.txt')
proof={'encoderSecondsCPU':elapsed,'embeddingMaxError':difference,'decoderMaxError':maskDiff,'scoreMaxError':scoreDiff,'modelBytes':sum(f['bytes'] for f in manifest['files'].values()),'source':'Actual original infographic, r33 REAL Gemini box','onnxRuntime':'1.21.0'}
(ROOT/'evidence/studio/loop/sam-cpu/onnx-parity.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
