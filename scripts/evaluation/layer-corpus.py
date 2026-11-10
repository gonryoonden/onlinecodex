#!/usr/bin/env python3
"""Deterministic self-authored designs. No downloads or private assets.
Person/product/photo-like cases are synthetic proxies, NOT photo benchmarks.
Usage: python layer-corpus.py OUT (Pillow + numpy, installed Studio venv).
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
out=Path(sys.argv[1]); out.mkdir(parents=True,exist_ok=True)
W,H=600,400
font_path='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
def font(n): return ImageFont.truetype(font_path,n,index=1)
cases=[]
names=['korean-poster','mixed-language','icons','person-proxy','product-proxy','overlap','solid-dark','gradient','photo-texture-proxy','shadow-alpha','small-text','illustration']
for num,name in enumerate(names):
    folder=out/name; folder.mkdir(exist_ok=True)
    bg=Image.new('RGBA',(W,H),(250,250,250,255))
    if name=='solid-dark': bg=Image.new('RGBA',(W,H),(22,45,90,255))
    if name in ['gradient','photo-texture-proxy']:
        y,x=np.mgrid[:H,:W]; a=np.zeros((H,W,4),dtype=np.uint8);a[:,:,3]=255
        for c in range(3):
            a[:,:,c]=np.clip(180+c*18+x*.06+y*.025+(20*np.sin(x/13)*np.cos(y/17) if name=='photo-texture-proxy' else 0),0,255)
        bg=Image.fromarray(a)
    # Static text remains background in this local candidate benchmark. Ground
    # truth strings are recorded, never passed as recognized OCR output.
    d=ImageDraw.Draw(bg); title=['안전한 작업 환경','Korea 2026 · 교육 80%','아이콘 안내','인물 합성 프록시','제품 합성 프록시','겹친 객체','단색 배경','그라데이션','사진 질감 합성 프록시','그림자와 반투명','작은 글씨','복합 일러스트'][num]
    d.text((28,25),title,font=font(24),fill='white' if name=='solid-dark' else '#243a42')
    if name=='small-text':
        for k in range(8):d.text((24,80+25*k),f'{k+1}. 안내 사항 · 2026년 교육 80%',font=font(11),fill='#46565e')
    bg.save(folder/'background.png')
    layers=[]
    def obj(kind,x,y,color):
        im=Image.new('RGBA',(W,H)); q=ImageDraw.Draw(im)
        if kind=='disc': q.ellipse((x,y,x+58,y+58),fill=color)
        elif kind=='person':
            q.ellipse((x+20,y,x+52,y+32),fill=color);q.rounded_rectangle((x,y+34,x+72,y+94),radius=15,fill=color)
        elif kind=='product':
            q.rounded_rectangle((x+8,y+15,x+62,y+95),radius=9,fill=color);q.rectangle((x+20,y,x+50,y+18),fill='#81919d');q.rectangle((x+20,y+48,x+50,y+64),fill='#f0c77a')
        elif kind=='star': q.polygon([(x+35,y),(x+44,y+25),(x+70,y+28),(x+50,y+44),(x+58,y+70),(x+35,y+55),(x+12,y+70),(x+20,y+44),(x,y+28),(x+26,y+25)],fill=color)
        elif kind=='illustration':
            q.rounded_rectangle((x,y+25,x+80,y+85),radius=9,fill=color);q.ellipse((x+5,y,x+40,y+45),fill='#78a2bd');q.ellipse((x+40,y+6,x+76,y+48),fill='#9bb7c5');q.line((x+12,y+56,x+64,y+56),fill='#f3ca64',width=5)
        else:q.rounded_rectangle((x,y,x+62,y+62),radius=10,fill=color)
        layers.append(im)
    neutral=(168,168,168,255)
    if name=='person-proxy':obj('person',160,140,neutral);obj('person',370,170,(28,95,150,255))
    elif name=='product-proxy':obj('product',150,140,neutral);obj('product',380,140,(60,140,125,255))
    elif name=='overlap':obj('disc',180,160,(40,100,160,255));obj('star',213,177,(185,100,65,255))
    elif name=='shadow-alpha':
        shadow=Image.new('RGBA',(W,H));ImageDraw.Draw(shadow).ellipse((165,163,223,221),fill=(0,0,0,70));layers.append(shadow.filter(ImageFilter.GaussianBlur(5)));obj('disc',160,150,(80,135,170,170));obj('rect',380,180,neutral)
    elif name=='illustration':obj('illustration',130,150,neutral);obj('star',380,160,(50,120,170,255))
    elif name=='icons':
        for i,k in enumerate(['disc','star','rect']):obj(k,95+170*i,155,neutral if i<2 else (40,100,160,255))
    else:obj('disc',140,150,neutral if name!='solid-dark' else (220,220,220,255));obj('rect',380,180,(40,100,160,255))
    original=bg.copy(); objects=[]
    for i,im in enumerate(layers):
        original=Image.alpha_composite(original,im);im.getchannel('A').save(folder/f'mask-{i}.png')
        without=bg.copy()
        for j,other in enumerate(layers):
            if j!=i:without=Image.alpha_composite(without,other)
        without.save(folder/f'without-{i}.png');objects.append({'id':i,'mask':f'mask-{i}.png','without':f'without-{i}.png'})
    original.save(folder/'original.png')
    cases.append({'id':name,'width':W,'height':H,'text':[title],'objects':objects,'source':'self-authored synthetic','realPhoto':False})
(out/'manifest.json').write_text(json.dumps({'version':1,'seed':'deterministic-no-random','license':'self-authored test fixtures; no external images','cases':cases},ensure_ascii=False,indent=2))
print(f'{len(cases)} synthetic designs written to {out}')
