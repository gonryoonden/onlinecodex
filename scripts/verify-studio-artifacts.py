#!/usr/bin/env python3
"""Inspect actual browser downloads, not generator assumptions."""
from pathlib import Path
import base64,hashlib,io,json,re,zipfile,os
from PIL import Image,ImageChops,ImageDraw
from lxml import etree
import fitz
from pptx import Presentation
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('STUDIO_EVIDENCE_DIR',str(ROOT/'evidence/studio')));NS={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
report={}
for name in ['browser-current.png','synthetic-reconstructed.png']:
 im=Image.open(OUT/name);im.verify();report[name]={'readable':True,'bytes':(OUT/name).stat().st_size}
pdf=fitz.open(OUT/'browser-two-pages.pdf');assert len(pdf)==2
for i,page in enumerate(pdf):page.get_pixmap(matrix=fitz.Matrix(1,1)).save(OUT/f'pdf-page-{i+1}.png')
report['pdf']={'pages':len(pdf),'rendered':True}
ppt=OUT/'browser-two-pages.pptx';z=zipfile.ZipFile(ppt);assert z.testzip() is None
slides=sorted(n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+.xml',n));assert len(slides)==2
records=[]
for slide in slides:
 root=etree.fromstring(z.read(slide))
 for rgb in root.xpath('//a:srgbClr/@val',namespaces=NS):assert re.fullmatch('[0-9A-F]{6}',rgb)
 text=root.xpath('//a:t/text()',namespaces=NS);records.append({'slide':slide,'texts':text,'nativeShapes':len(root.xpath('//p:sp',namespaces=NS)),'images':len(root.xpath('//p:pic',namespaces=NS))})
assert '두 번째 페이지 독립 객체' in ''.join(records[0]['texts'])
assert '한글 텍스트 수정' in ''.join(records[1]['texts'])
assert records[1]['nativeShapes']>=3 and records[1]['images']==1
assert len(Presentation(ppt).slides)==2
for media in (n for n in z.namelist() if n.startswith('ppt/media/')):Image.open(io.BytesIO(z.read(media))).verify()
report['pptx']={'zipIntegrity':True,'pythonPptxOpen':True,'slides':records}
backup=zipfile.ZipFile(OUT/'browser-project.studio.zip');p=json.loads(backup.read('project.json'))
for asset in p['assets'].values():assert hashlib.sha256(backup.read(asset['path'])).hexdigest()==asset['sha256']
report['zip']={'schemaVersion':p['schemaVersion'],'pages':len(p['pages']),'assets':len(p['assets']),'sha256Verified':True}
p=json.loads((OUT/'synthetic-reconstructed-project.json').read_text());a=next(a for a in p['assets'].values() if not a['original']);im=Image.open(io.BytesIO(base64.b64decode(a['dataUrl'].split(',')[1])));assert im.mode=='RGBA';assert im.getpixel((0,0))[3]==0;assert im.getpixel((im.width//2,im.height//2))[3]==255
element=next(e for e in p['pages'][1]['elements'] if e['type']=='image')
left,top,cw,ch=map(int,element['provenance']['sourcePixels'])
source_image=Image.open(ROOT/'tests/studio/fixtures/synthetic.png').convert('RGB')
opaque=0
for y in range(im.height):
 for x in range(im.width):
  pixel=im.getpixel((x,y))
  if pixel[3]==255:
   assert pixel[:3]==source_image.getpixel((left+x,top+y)), 'Opaque source pixel changed'
   opaque+=1
assert opaque>1000
report['maskedSourcePixels']={'opaqueCompared':opaque,'unchanged':True,'roi':[left,top,cw,ch]}
original=Image.open(ROOT/'tests/studio/fixtures/synthetic.png').convert('RGB');reconstructed=Image.open(OUT/'synthetic-reconstructed.png').convert('RGB');assert reconstructed.size==original.size
# Old title position is blank after native text edit/move; object mask pixels remain source colors.
old_text_pixels=[(x,y) for x in range(70,100) for y in range(55,130) if original.getpixel((x,y))!=(244,248,245)]
assert old_text_pixels, 'source must contain glyph pixels in the old location'
assert all(reconstructed.getpixel(pos)==(244,248,245) for pos in old_text_pixels), 'old text residue detected'
report['synthetic']={'alphaOutside':0,'alphaInside':255,'nativeText':sum(e['type']=='text' for e in p['pages'][1]['elements']),'nativeShapes':sum(e['type'] in ('rect','ellipse','line') for e in p['pages'][1]['elements']),'backgroundGhostTest':'known original title position blank','classification':'manual ground truth; approximate typography and polygon border, not AI recognition'}
combined=Image.new('RGB',(1920,690),'#E7EDEE');combined.paste(original,(0,50));combined.paste(reconstructed,(960,50));draw=ImageDraw.Draw(combined);draw.text((20,15),'ORIGINAL (known synthetic pixels)',fill='#18333B');draw.text((980,15),'MANUAL RECONSTRUCTION (native text edited/moved)',fill='#18333B');combined.save(OUT/'synthetic-comparison.png')
(OUT/'artifact-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
