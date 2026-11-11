#!/usr/bin/env python3
"""Real box-prompt inference. No masks/polygons are supplied by the evaluator."""
import os,sys
runtime=os.environ.get('STUDIO_SEGMENT_PYTHON')
if runtime and os.path.abspath(sys.executable)!=os.path.abspath(runtime):os.execv(runtime,[runtime,__file__])
import hashlib,json,time,resource
from pathlib import Path
import numpy as np,torch
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
repo=Path(os.environ['STUDIO_MOBILE_SAM_REPO']);weight=repo/'weights/mobile_sam.pt'
assert hashlib.sha256(weight.read_bytes()).hexdigest()=='6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f'
sys.path.insert(0,str(repo));from mobile_sam import sam_model_registry,SamPredictor
torch.set_num_threads(2);torch.manual_seed(0)
out=ROOT/'work/mobile-sam';out.mkdir(parents=True,exist_ok=True)
source=ROOT/'2024년_산업안전보건교육_주요_개정_요약.png';image=np.array(Image.open(source).convert('RGB'));H,W=image.shape[:2]
analysis=json.loads((ROOT/'evidence/studio/phase3/gemini-live-improved.json').read_text())['result']['analysis']
t=time.perf_counter();model=sam_model_registry['vit_t'](checkpoint=str(weight)).eval();predictor=SamPredictor(model);predictor.set_image(image);encode=time.perf_counter()-t
results=[];tiles=[];enriched=json.loads(json.dumps(analysis))
with torch.inference_mode():
 for r in enriched['regions']:
  if r['type']!='image':continue
  x,y,w,h=np.array(r['bbox'])*np.array([W,H,W,H])/1000;box=np.array([x,y,x+w,y+h]);start=time.perf_counter()
  masks,scores,_=predictor.predict(box=box,multimask_output=True);idx=int(np.argmax(scores));mask=masks[idx];count=int(mask.sum());ys,xs=np.where(mask)
  if count:
   l=max(0,int(xs.min())-3);t=max(0,int(ys.min())-3);right=min(W,int(xs.max())+4);bottom=min(H,int(ys.max())+4)
  else:l,t,right,bottom=0,0,1,1
  cropMask=(mask[t:bottom,l:right]*255).astype('uint8');cut=np.dstack([image[t:bottom,l:right],cropMask]);Image.fromarray(cropMask).save(out/f'{r["id"]}-mask.png');Image.fromarray(cut).save(out/f'{r["id"]}-alpha.png')
  inside=int(mask[max(0,int(y)):min(H,int(np.ceil(y+h))),max(0,int(x)):min(W,int(np.ceil(x+w)))].sum());spill=(count-inside)/max(1,count);coverage=inside/max(1,w*h)
  accepted=bool(count>40 and scores[idx]>=.8 and spill<.15 and .02<coverage<.99)
  results.append(dict(id=r['id'],predictedIoU=float(scores[idx]),foreground=count,boxCoverage=float(coverage),spill=float(spill),structurallyAccepted=accepted,decodeSeconds=time.perf_counter()-start,sourceBox=r['bbox'],maskBox=[l,t,right-l,bottom-t],manualMask=False))
  # Export model masks in cropped box coordinates for exact one-to-one alpha.
  r['bbox']=[l/W*1000,t/H*1000,(right-l)/W*1000,(bottom-t)/H*1000];r['maskFile']=f'{r["id"]}-mask.png'
  tile=Image.new('RGB',(480,200),'white');d=ImageDraw.Draw(tile);d.text((4,2),f'{r["id"]} IoU(pred)={scores[idx]:.3f} spill={spill:.2f} accepted={accepted}',fill='black')
  src=Image.fromarray(image[max(0,int(y)-8):min(H,int(y+h)+8),max(0,int(x)-8):min(W,int(x+w)+8)]);src.thumbnail((150,165));tile.paste(src,(0,28))
  alpha=Image.fromarray(cut);alpha.thumbnail((150,165));checker=Image.new('RGB',alpha.size,'#777777');checker.paste(alpha,mask=alpha.getchannel('A'));tile.paste(checker,(160,28));m=Image.fromarray(cropMask).convert('RGB');m.thumbnail((150,165));tile.paste(m,(320,28));tiles.append(tile)
for start in range(0,len(tiles),9):
 sheet=Image.new('RGB',(1440,600),'#dddddd')
 for i,tile in enumerate(tiles[start:start+9]):sheet.paste(tile,((i%3)*480,(i//3)*200))
 sheet.save(out/f'contact-{start//9+1}.png')
report=dict(model='MobileSAM vit_t',weightSHA256=hashlib.sha256(weight.read_bytes()).hexdigest(),sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),input='stored-real-Gemini-boxes',freshGeminiCall=False,manualMasks=0,modelEncodeSeconds=encode,peakRSSMiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,structurallyAccepted=sum(r['structurallyAccepted'] for r in results),total=len(results),visualQuality='pending-independent-review',candidates=results)
(out/'probe.json').write_text(json.dumps(report,indent=2)+'\n');(out/'analysis-with-mask-files.json').write_text(json.dumps(enriched,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='candidates'}));assert report['structurallyAccepted']>0,'No automatic mask passed structural screening'
