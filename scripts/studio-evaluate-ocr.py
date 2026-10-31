#!/usr/bin/env python3
"""Evaluate saved live text. Does not make an API call or score manual regions as AI."""
import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'evidence/studio/phase3'
path=Path(sys.argv[1]) if len(sys.argv)>1 else OUT/'live-35-simplified.json'
path=path.resolve();data=json.loads(path.read_text());analysis=json.loads(data['text']) if 'text' in data else data['result']['analysis']
truth=json.loads((ROOT/'tests/studio/fixtures/real-korean.truth.json').read_text())['blocks']
truth=[truth[0],truth[1]+'\n'+truth[2],*truth[3:]]
def clean(s):return re.sub(r'\s+','',s.replace('\\n','\n'))
def distance(a,b):
 prev=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  row=[i]
  for j,y in enumerate(b,1):row.append(min(row[-1]+1,prev[j]+1,prev[j-1]+(x!=y)))
  prev=row
 return prev[-1]
regions=[r for r in analysis['regions'] if r['type']=='text'];available=set(range(len(regions)));records=[];total=0
for ref in truth:
 a=clean(ref)
 best=min(available,key=lambda i:distance(a,clean(regions[i].get('text','')))/max(1,len(a)),default=None)
 if best is not None and distance(a,clean(regions[best].get('text','')))/max(1,len(a))<.6:
  r=regions[best];available.remove(best);pred=r.get('text','');d=distance(a,clean(pred))
 else:r={};pred='';d=len(a)
 total+=d;records.append({'reference':ref,'regionId':r.get('id'),'prediction':pred,'characterErrors':d,'literalNewlineMarkers':pred.count('\\n')})
report={'source':str(path.relative_to(ROOT)),'mode':'saved live API response, no new calls','matching':'greedy text matching; whitespace removed and literal newline markers normalized for CER; geometric accuracy NOT included','referenceCharacters':sum(len(clean(t)) for t in truth),'characterErrors':total,'cer':total/sum(len(clean(t)) for t in truth),'referenceBlocks':len(truth),'missingBlocks':sum(r['regionId'] is None for r in records),'extraTextRegions':[regions[i]['id'] for i in available],'objects':{kind:sum(r['type']==kind for r in analysis['regions']) for kind in ['text','shape','image']},'styleRegions':sum(bool(r.get('style')) for r in analysis['regions']),'blocks':records,'warning':'CER does not certify correct geometry, colors, segmentation or completeness of image objects.'}
(OUT/(path.stem+'-ocr.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='blocks'},ensure_ascii=False,indent=2))
