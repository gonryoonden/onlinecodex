#!/usr/bin/env python3
"""Score same-resolution RGB compositions with 7x7 sample-covariance SSIM.
Build an inspection sheet: original / legacy alpha / adaptive alpha / result.
Masks here are known synthetic truth, not human-reviewed real-world annotations.
"""
import json,sys
import numpy as np
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(sys.argv[1]);repo=Path(__file__).resolve().parents[2]
def scores(left,right):
    a,b=np.asarray(left,dtype=float),np.asarray(right,dtype=float)
    def box(v):
        s=np.pad(v,((1,0),(1,0),(0,0))).cumsum(0).cumsum(1)
        return (s[7:,7:]-s[:-7,7:]-s[7:,:-7]+s[:-7,:-7])/49
    ma,mb=box(a),box(b)
    va,vb=(box(a*a)-ma*ma)*49/48,(box(b*b)-mb*mb)*49/48
    cov=(box(a*b)-ma*mb)*49/48
    ssim=((2*ma*mb+6.5025)*(2*cov+58.5225))/((ma*ma+mb*mb+6.5025)*(va+vb+58.5225))
    return {'ssim':float(ssim.mean()),'rgb_mae':float(abs(a-b).mean())}
rows=json.loads((root/'results.json').read_text());manifest=json.loads((root/'manifest.json').read_text())
font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',16,index=1)
sheet=Image.new('RGB',(1200,len(manifest['cases'])*235),'#eef2f4');draw=ImageDraw.Draw(sheet)
for idx,case in enumerate(manifest['cases']):
 d=root/case['id'];source=Image.open(d/'original.png').convert('RGB')
 for r in [x for x in rows if x['case']==case['id']]:
  r['fullImage']=scores(source,Image.open(d/f"{r['strategy']}-composite.png").convert('RGB'))
  r['strictMaskMatchesAtIoU09']=sum(x['iou']>=.9 for x in r['matches'])
 for col,(file,label) in enumerate([('original.png','SOURCE'),('legacy-mask.png','LEGACY ALPHA'),('adaptive-mask.png','ADAPTIVE ALPHA'),('adaptive-composite.png','RECOMPOSED')]):
  im=Image.open(d/file).convert('RGB');im.thumbnail((300,200));sheet.paste(im,(col*300,idx*235+30));draw.text((col*300+6,idx*235+4),f'{case["id"]} / {label}',fill='#1f3945',font=font)
sheet.save(root/'comparison-12.png');(root/'quality.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
print(json.dumps({s:{'matchedIoU05':sum(r['matched'] for r in rows if r['strategy']==s),'matchedIoU09':sum(r['strictMaskMatchesAtIoU09'] for r in rows if r['strategy']==s),'false':sum(r['falseCandidates'] for r in rows if r['strategy']==s),'maxFullMae':max(r['recompositionMae'] for r in rows if r['strategy']==s)}for s in ['legacy','adaptive']},indent=2))
