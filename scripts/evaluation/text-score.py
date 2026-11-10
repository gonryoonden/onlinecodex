#!/usr/bin/env python3
"""Score a supplied reviewed reference against recorded text. No OCR/API calls.
Usage: python text-score.py REFERENCE_JSON RECORDED_GEMINI_JSON OUTPUT_JSON
Reference must describe its provenance/human verification status.
"""
import sys,json,unicodedata
from pathlib import Path
def distance(a,b):
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        new=[i]
        for j,y in enumerate(b,1):new.append(min(new[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=new
    return row[-1]
reference=json.loads(Path(sys.argv[1]).read_text());record=json.loads(Path(sys.argv[2]).read_text())
regions=record['result']['analysis']['regions'];texts={r['id']:r.get('text','')for r in regions if r['type']=='text'}
results=[]
for trim in [False,True]:
    norm=lambda t:''.join(unicodedata.normalize('NFC',t).split())if trim else unicodedata.normalize('NFC',t)
    blocks=[{'id':key,'characters':len(norm(value)),'distance':distance(norm(value),norm(texts.get(key,''))),'lineBreakCountsMatch':value.count('\n')==texts.get(key,'').count('\n')}for key,value in reference['texts'].items()]
    total=sum(x['characters']for x in blocks);edits=sum(x['distance']for x in blocks)
    results.append({'whitespaceRemoved':trim,'characters':total,'edits':edits,'cer':edits/total,'blocks':blocks})
output={'referenceStatus':reference['referenceStatus'],'scope':reference['scope'],'source':'recorded API response; no new inference','results':results}
Path(sys.argv[3]).write_text(json.dumps(output,ensure_ascii=False,indent=2));print(json.dumps([{k:v for k,v in r.items()if k!='blocks'}for r in results]))
