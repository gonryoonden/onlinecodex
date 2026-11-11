"""Aggregate measured browser evidence; no inferred pass counts for unknown quality."""
import json,pathlib,zipfile,io,collections,hashlib
import numpy as np
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[2];work=ROOT/'work/ux-browser';dest=ROOT/'evidence/studio/ux-loop';dest.mkdir(parents=True,exist_ok=True)
rows=[]
for name in ['korean','eda-checklist','data-roles']:
 d=json.loads((work/f'auto-{name}.json').read_text());assert d['ready']+d['warning']+d['review']+d['failed']==d['total'];rows.append(d)
 for suffix in ['.json','-flow.json','-corrected-flow.json']:
  p=work/f'auto-{name}{suffix}'
  if p.exists():(dest/p.name).write_bytes(p.read_bytes())
for n in ['auto-cancel.json']:
 p=work/n
 if p.exists():(dest/n).write_bytes(p.read_bytes())
# Visually identified semantic problems from source/cutout contact sheets, not a complete corpus.
annotated={'r11':'paperclip interior hole filled','r12':'two clips and their interior background merged','r26':'glasses lenses filled with source background','r31':'scissors handle holes filled'}
byid={c['id']:c for c in rows[0]['inventory']}
annotations=[dict(id=id,problem=why,decision=byid[id]['decision'],caught=byid[id]['decision'] in ['review','failed']) for id,why in annotated.items()]
assert all(a['caught'] for a in annotations)
with zipfile.ZipFile(work/'auto-korean.studio.zip') as z:
 p=json.loads(z.read('project.json'));pg=p['pages'][1];orig=p['assets'][p['sources'][pg['id']]];bg=next(e for e in pg['elements'] if e['type']=='image' and e['locked']);back=p['assets'][bg['assetId']];a=np.array(Image.open(io.BytesIO(z.read(orig['path']))).convert('RGB')).astype('int16');b=np.array(Image.open(io.BytesIO(z.read(back['path']))).convert('RGB')).astype('int16');el=next(e for e in pg['elements'] if e.get('provenance',{}).get('regionId')=='r33');x,y,w,h=el['provenance']['sourcePixels']
 def yellow(c):return int(((c[:,:,0]>180)&(c[:,:,1]>110)&(c[:,:,2]<155)&(c[:,:,0]-c[:,:,2]>60)).sum())
 residual=dict(region='r33 helmet source-pixel rectangle',originalYellowPixels=yellow(a[y:y+h,x:x+w]),repairedYellowPixels=yellow(b[y:y+h,x:x+w]),metricScope='body-color ghost check, not hidden texture ground truth')
 assert residual['originalYellowPixels']>1000 and residual['repairedYellowPixels']==0
summary=dict(realSources=3,freshGeminiCalls=0,rows=[{k:v for k,v in r.items() if k!='inventory'} for r in rows],semanticAnnotations=annotations,annotatedSeriousMissed=sum(not a['caught'] for a in annotations),unnecessaryReviewCount='unmeasured: full background truth unavailable',unannotatedSeriousErrors='unknown',residual=residual,priorStateSHA256=hashlib.sha256((ROOT/'docs/loop-engineering/state.json').read_bytes()).hexdigest())
(dest/'results.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False))
