#!/usr/bin/env python3
"""Deterministic/manual evaluation only. Never an AI/OCR success measurement."""
import base64, importlib.util, io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('repair',ROOT/'scripts/studio-inpaint.py')
repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)
OUT=ROOT/'evidence/studio/phase3/quality';OUT.mkdir(parents=True,exist_ok=True)
# Fixed before measuring. A real hidden background has no reference: never score it as recovered.
CRITERIA={'synthetic_masked_rgb_mae_max':8,'unmasked_pixels_identical':True,'real_hidden_background':'no ground truth; visual review required','ocr_cer':'N/A until live AI response','mask_iou':'N/A; manually supplied masks are not predictions'}
def decode(url): return Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB')
def compare(images,name):
 thumbs=[]
 for image in images:
  im=image.copy();im.thumbnail((760,500));thumbs.append(im)
 canvas=Image.new('RGB',(sum(i.width for i in thumbs),max(i.height for i in thumbs)),'white');x=0
 for im in thumbs: canvas.paste(im,(x,0));x+=im.width
 canvas.save(OUT/name)
def ssim(a,b):
 # Global SSIM, RGB luminance; specified separately from prior windowed SSIM.
 a=a.astype(float).mean(2);b=b.astype(float).mean(2)
 return float(((2*a.mean()*b.mean()+6.5025)*(2*np.mean((a-a.mean())*(b-b.mean()))+58.5225))/((a.mean()**2+b.mean()**2+6.5025)*(a.var()+b.var()+58.5225)))
fonts=list(Path('/usr/share/fonts').rglob('*NotoSansCJK*'))
if not fonts: fonts=list(Path('/usr/share/fonts').rglob('DejaVuSans.ttf'))
font=ImageFont.truetype(str(fonts[0]),24)
rows=[]
for kind in ['korean-text','flat-shapes','complex-background','overlapping-objects','table-layout']:
 y,x=np.mgrid[0:320,0:480]
 if kind=='complex-background':
  channel=(160+35*np.sin(x/13)+25*np.cos(y/17)).astype('uint8');arr=np.stack([channel,channel,np.clip(channel.astype(int)+20,0,255).astype('uint8')],2)
 else: arr=np.full((320,480,3),[192,224,208],dtype='uint8')
 hidden=Image.fromarray(arr);source=hidden.copy();d=ImageDraw.Draw(source)
 region={'id':'manual','type':'image','bbox':[350,300,280,350]}
 if kind=='korean-text':
  d.text((168,96),'한글 교육',font=font,fill='#203040');region.update(type='text',bbox=[340,280,300,170])
 elif kind=='table-layout':
  for yy in [96,128,160,192]: d.line((168,yy,302,yy),fill='#204060',width=3)
  for xx in [168,235,302]: d.line((xx,96,xx,208),fill='#204060',width=3)
 elif kind=='overlapping-objects':
  d.ellipse((170,98,260,190),fill='#c06060');d.rectangle((220,140,300,205),fill='#4060a0')
 else: d.rectangle((170,98,300,205),fill='#204060')
 source.save(OUT/(kind+'.png'));hidden.save(OUT/(kind+'-hidden.png'))
 results=[]
 for method in ['telea','ns']:
  payload={'image':repair.png_url(source),'analysis':{'regions':[region]},'skip':[],'method':method,'textMode':'boxes','padding':3}
  result=repair.repair(payload);actual=decode(result['background']);actual.save(OUT/(kind+'-'+method+'.png'))
  m=np.asarray(decode(result['mask']))[:,:,0]>0
  a=np.asarray(actual);b=np.asarray(hidden);orig=np.asarray(source)
  mae=float(np.abs(a.astype(float)-b).mean(2)[m].mean())
  results.append({'method':method,'masked_rgb_mae_before':float(np.abs(orig.astype(float)-b).mean(2)[m].mean()),'masked_rgb_mae_after':mae,'global_ssim':ssim(a,b),'unmasked_pixels_identical':bool(np.array_equal(a[~m],orig[~m])),'passes_fixed_mae':mae<=CRITERIA['synthetic_masked_rgb_mae_max']})
 compare([source,decode(repair.repair({**payload,'method':'telea'})['background']),hidden],kind+'-comparison.png')
 rows.append({'fixture':kind,'mode':'synthetic manual ground truth','results':results})
source=Image.open(ROOT/'2024년_산업안전보건교육_주요_개정_요약.png').convert('RGB')
regions=[{'id':'title','type':'text','bbox':[150,30,700,65]}, {'id':'helmet','type':'image','bbox':[267,797,67,139]}]
payload={'image':repair.png_url(source),'analysis':{'regions':regions},'skip':[],'method':'telea','textMode':'boxes','padding':3}
real=[]
for method in ['telea','ns']:
 result=repair.repair({**payload,'method':method});actual=decode(result['background']);actual.save(OUT/('real-manual-'+method+'.png'))
 compare([source,actual],'real-manual-'+method+'-comparison.png')
 real.append({'method':method,'mode':'real image, manually supplied title and helmet boxes; not AI','diagnostics':result['diagnostics'],'quality':'visual review required; no hidden-background reference','cer':None,'iou':None})
report={'criteria':CRITERIA,'synthetic':rows,'real':real,'manual_regions':regions,'live_gemini_calls':0}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
