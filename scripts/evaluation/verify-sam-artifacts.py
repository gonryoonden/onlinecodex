#!/usr/bin/env python3
"""Open actual browser downloads, validate package links, render through LibreOffice."""
import json,os,posixpath,subprocess,zipfile
from pathlib import Path
import fitz
from lxml import etree
from pptx import Presentation
ROOT=Path(__file__).resolve().parents[2];work=ROOT/'work/loop-browser';out=ROOT/'work/sam-office';out.mkdir(parents=True,exist_ok=True);rows=[]
for name in ['sam-korean','sam-eda-checklist','sam-data-roles']:
 pdf=fitz.open(work/(name+'.pdf'));assert pdf.page_count==2
 package=work/(name+'.pptx')
 with zipfile.ZipFile(package) as z:
  assert z.testzip() is None;names=set(z.namelist());parser=etree.XMLParser(resolve_entities=False,no_network=True)
  for entry in names:
   if entry.endswith(('.xml','.rels')):etree.fromstring(z.read(entry),parser)
   if entry.endswith('.rels'):
    base='' if entry=='_rels/.rels' else posixpath.dirname(posixpath.dirname(entry))
    root=etree.fromstring(z.read(entry),parser)
    for relation in root:
     if relation.get('TargetMode')=='External':continue
     target=posixpath.normpath(posixpath.join(base,relation.get('Target',''))).lstrip('/')
     assert target in names,(entry,target)
 deck=Presentation(package);assert len(deck.slides)==2
 assert any('Automatic alpha' in s.text for s in deck.slides[1].shapes if s.has_text_frame)
 result=subprocess.run(['soffice','--headless','--convert-to','pdf','--outdir',str(out),str(package)],capture_output=True,text=True,timeout=90)
 assert result.returncode==0,(result.stdout,result.stderr)
 rendered=fitz.open(out/(name+'.pdf'));assert rendered.page_count==2
 assert 'Automatic alpha' in rendered[1].get_text()
 rendered[1].get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(out/(name+'-office.png'))
 rows.append({'source':name,'pdfPages':pdf.page_count,'pptxOpened':True,'allXmlParsed':True,'allInternalRelationshipsResolved':True,'libreOfficeRendered':True,'renderedPdfPages':rendered.page_count,'nativeEditedTextSurvived':True})
(ROOT/'evidence/studio/loop/sam-browser/office-validation.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows))
