#!/usr/bin/env python3
"""Known-ground-truth fixture; no OCR or AI has been run."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,base64,io
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'tests/studio/fixtures';out.mkdir(parents=True,exist_ok=True)
w,h=960,640;bg='#F4F8F5';im=Image.new('RGB',(w,h),bg);d=ImageDraw.Draw(im)
font='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';bold='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
d.text((70,55),'우리의 안전, 함께 만들어요',font=ImageFont.truetype(bold,40),fill='#18333B')
d.text((73,130),'한글 텍스트와 독립적인 편집 레이어',font=ImageFont.truetype(font,22),fill='#53666B')
d.rectangle((80,250,350,410),fill='#32857A');d.ellipse((280,340,430,490),fill='#D9AE49');d.rounded_rectangle((500,230,750,330),25,fill='#D46C43')
d.line((80,550,430,550),fill='#18333B',width=5)
poly=[(710,370),(820,455),(710,540),(600,455)];d.polygon(poly,fill='#5A759E');d.polygon([(710,395),(790,455),(710,515),(630,455)],fill='#9FB8D7')
im.save(out/'synthetic.png')
im.save(out/'synthetic.webp',format='WEBP',quality=95)
exif=Image.Exif();exif[274]=6;im.save(out/'synthetic-exif.jpg',format='JPEG',quality=95,exif=exif)
def box(x,y,bw,bh):return [x/w*1000,y/h*1000,bw/w*1000,bh/h*1000]
regions=[{'id':'title','type':'text','text':'우리의 안전, 함께 만들어요','bbox':box(70,65,800,70),'zIndex':5,'review':False,'style':{'color':'#18333B','fontSize':40/h*1000,'bold':True,'align':'left'}},{'id':'subtitle','type':'text','text':'한글 텍스트와 독립적인 편집 레이어','bbox':box(73,136,760,40),'zIndex':6,'review':False,'style':{'color':'#53666B','fontSize':22/h*1000,'bold':False,'align':'left'}},{'id':'rect','type':'shape','shape':'rect','bbox':box(80,250,270,160),'style':{'color':'#32857A'},'zIndex':1,'review':False},{'id':'circle','type':'shape','shape':'ellipse','bbox':box(280,340,150,150),'style':{'color':'#D9AE49'},'zIndex':2,'review':False},{'id':'rounded','type':'shape','shape':'rounded-rect','bbox':box(500,230,250,100),'style':{'color':'#D46C43'},'zIndex':3,'review':False},{'id':'diamond','type':'image','bbox':box(600,370,220,170),'polygon':[[x/w*1000,y/h*1000] for x,y in poly],'zIndex':4,'review':False}]
regions.append({'id':'rule','type':'shape','shape':'line','bbox':box(80,550,350,6),'style':{'color':'#18333B'},'zIndex':7,'review':False})
analysis={'background':{'kind':'solid','from':bg,'to':bg,'angle':90},'regions':regions,'notes':'TEST ONLY · synthetic ground truth, not an AI analysis. Text font rasterizers differ; hidden pixels are not inferred.'}
(out/'synthetic.analysis.json').write_text(json.dumps(analysis,ensure_ascii=False,indent=2))
# Native project fixture for adapter tests and browser ZIP import.
shadow={'enabled':False,'color':'#000000','blur':12,'offsetX':0,'offsetY':6}
def base(typ,x,y,width,height):return {'id':f'{typ}_{x}_{y}','type':typ,'x':x,'y':y,'width':width,'height':height,'rotation':0,'opacity':1,'locked':False,'visible':True,'shadow':shadow}
t={**base('text',70,65,800,80),'text':'첫 페이지 한글 편집 가능','fontFamily':'Noto Sans KR','fontSize':40,'bold':True,'italic':False,'underline':False,'strike':False,'uppercase':False,'fill':'#18333B','align':'left','lineHeight':1.25,'letterSpacing':0}
r={**base('rect',80,250,270,160),'fill':'#32857A','stroke':'transparent','strokeWidth':0,'cornerRadius':0}
c={**base('ellipse',280,340,150,150),'fill':'#D9AE49','stroke':'transparent','strokeWidth':0,'cornerRadius':0}
source64='data:image/png;base64,'+base64.b64encode((out/'synthetic.png').read_bytes()).decode();asset={'id':'original','name':'synthetic.png','mime':'image/png','width':w,'height':h,'dataUrl':source64,'original':True}
# genuinely alpha-masked source pixels for independent image
crop=im.crop((600,370,820,540)).convert('RGBA');mask=Image.new('L',crop.size);ImageDraw.Draw(mask).polygon([(x-600,y-370) for x,y in poly],fill=255);crop.putalpha(mask);crop.save(out/'diamond.png');b=io.BytesIO();crop.save(b,format='PNG');asset2={'id':'diamond','name':'diamond.png','mime':'image/png','width':220,'height':170,'dataUrl':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode(),'original':False}
i={**base('image',600,370,220,170),'assetId':'diamond','src':asset2['dataUrl'],'radius':0,'naturalWidth':220,'naturalHeight':170,'provenance':{'source':'original','regionId':'diamond','method':'test-ground-truth:polygon-mask','review':False}}
project={'schemaVersion':1,'id':'test_project','name':'합성 픽스처 · TEST ONLY','width':w,'height':h,'pages':[{'id':'p1','background':{'type':'solid','color':bg},'elements':[r,c,i,t]},{'id':'p2','background':{'type':'gradient','from':'#E1F0EC','to':'#B6D5CC','angle':90},'elements':[{**t,'id':'second_text','text':'두 번째 페이지 · 순서 확인'},{**r,'id':'second_rect','rotation':12,'opacity':.7}]}],'assets':{'original':asset,'diamond':asset2},'sources':{'p1':'original'},'createdAt':'2026-10-31T00:00:00.000Z','updatedAt':'2026-10-31T00:00:00.000Z','thumbnail':None,'source':'studio'}
(out/'project.json').write_text(json.dumps(project,ensure_ascii=False,indent=2))
print(out)
