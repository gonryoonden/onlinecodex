#!/usr/bin/env python3
"""Local CPU background and printed-text repair. No model, network or API key.
Text-ink masks reuse px-image2pptx (MIT). OpenCV Telea/NS are explicit approximations.
"""
import base64,io,json,sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageOps,ImageDraw
from studio_vendor.px_textmask import compute_masks,dilate_mask

def png_url(image):
 out=io.BytesIO();image.save(out,format='PNG');return 'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()

def read_source(data):
 if not isinstance(data,str) or len(data)>24*1024*1024:raise ValueError('invalid image size')
 prefix,encoded=data.split(',',1)
 if prefix not in ['data:image/png;base64','data:image/jpeg;base64','data:image/webp;base64']:raise ValueError('unsupported image MIME')
 raw=base64.b64decode(encoded,validate=True)
 image=Image.open(io.BytesIO(raw));fmt=image.format
 if fmt not in ['PNG','JPEG','WEBP'] or prefix.split('/')[1].split(';')[0]!={'PNG':'png','JPEG':'jpeg','WEBP':'webp'}[fmt]:raise ValueError('invalid image signature')
 image=ImageOps.exif_transpose(image).convert('RGB')
 if image.width*image.height>16_000_000 or max(image.size)>12000:raise ValueError('image exceeds 16MP')
 return image

def bbox_pixels(region,width,height):
 box=region['bbox']
 if len(box)!=4 or any(not isinstance(x,(int,float)) or not np.isfinite(x) for x in box):raise ValueError('invalid bbox')
 x,y,w,h=box
 if min(x,y)<0 or min(w,h)<=0 or x+w>1000.00001 or y+h>1000.00001:raise ValueError('bbox outside source')
 return x*width/1000,y*height/1000,w*width/1000,h*height/1000

def region_mask(region,width,height):
 x,y,w,h=bbox_pixels(region,width,height);mask=Image.new('L',(width,height));draw=ImageDraw.Draw(mask)
 if region.get('polygon'):
  polygon=region['polygon']
  if not 3<=len(polygon)<=256:raise ValueError('invalid polygon')
  draw.polygon([(round(p[0]*width/1000),round(p[1]*height/1000)) for p in polygon],fill=255)
 elif region.get('maskPng'):
  data=region['maskPng']
  if not data.startswith('data:image/png;base64,') or len(data)>2*1024*1024:raise ValueError('invalid alpha mask')
  with Image.open(io.BytesIO(base64.b64decode(data.split(',')[1],validate=True))) as image:
   if image.format!='PNG' or image.width*image.height>4_194_304:raise ValueError('invalid mask PNG')
   alpha=image.convert('L').resize((max(1,round(w)),max(1,round(h))),Image.Resampling.BILINEAR)
   mask.paste(alpha,(round(x),round(y)))
 elif region.get('shape')=='ellipse':draw.ellipse((x,y,x+w,y+h),fill=255)
 elif region.get('shape')=='rounded-rect':draw.rounded_rectangle((x,y,x+w,y+h),radius=min(w,h)*.15,fill=255)
 else:draw.rectangle((x,y,x+w,y+h),fill=255)
 return np.asarray(mask,dtype=np.uint8)

def restore(image,mask,method):
 if not np.any(mask):return image.copy()
 flag=cv2.INPAINT_TELEA if method=='telea' else cv2.INPAINT_NS
 out=cv2.inpaint(image,mask,3,flag)
 # OpenCV output is not allowed to change pixels outside the declared mask.
 out[mask==0]=image[mask==0]
 return out

def repair(payload):
 cv2.setNumThreads(2)
 source=read_source(payload['image']);rgb=np.asarray(source);bgr=cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR);height,width=bgr.shape[:2]
 regions=payload['analysis']['regions'];skip=set(payload.get('skip',[]));regions=[r for r in regions if r['id'] not in skip]
 if not regions or len(regions)>80:raise ValueError('select 1..80 regions')
 method=payload.get('method','telea')
 if method not in ['telea','ns']:raise ValueError('unsupported inpaint method')
 text_mode=payload.get('textMode','ink')
 if text_mode not in ['ink','boxes']:raise ValueError('invalid text mask method')
 padding=int(payload.get('padding',3))
 if not 0<=padding<=12:raise ValueError('invalid mask padding')
 text_regions=[r for r in regions if r['type']=='text'];text_boxes=np.zeros((height,width),dtype=np.uint8);ocr=[]
 for region in text_regions:
  text_boxes=np.maximum(text_boxes,region_mask(region,width,height));x,y,w,h=bbox_pixels(region,width,height);ocr.append({'bbox':{'x1':int(x),'y1':int(y),'x2':int(x+w),'y2':int(y+h)}})
 if text_mode=='ink' and ocr:
  _,_,text_mask=compute_masks(bgr,ocr,dilation=padding,padding=1)
 else:text_mask=dilate_mask(text_boxes,padding)
 all_mask=np.zeros((height,width),dtype=np.uint8)
 for region in regions:
  all_mask=np.maximum(all_mask,text_mask if region['type']=='text' else dilate_mask(region_mask(region,width,height),padding))
 all_mask=np.uint8(all_mask>0)*255;text_mask=np.uint8(text_mask>0)*255
 fraction=float(np.mean(all_mask>0))
 if fraction==0:raise ValueError('mask is empty; use full text boxes or correct regions')
 if fraction>.70:raise ValueError('mask covers over 70%; reduce regions or use deterministic background')
 background=restore(bgr,all_mask,method);objects=restore(bgr,text_mask,method)
 return {'background':png_url(Image.fromarray(cv2.cvtColor(background,cv2.COLOR_BGR2RGB))),'objectSource':png_url(Image.fromarray(cv2.cvtColor(objects,cv2.COLOR_BGR2RGB))),'mask':png_url(Image.fromarray(all_mask)),'textMask':png_url(Image.fromarray(text_mask)),'width':width,'height':height,'diagnostics':{'method':'opencv-'+method,'textMaskMode':text_mode,'maskPixels':int(np.count_nonzero(all_mask)),'textMaskPixels':int(np.count_nonzero(text_mask)),'maskedFraction':fraction,'unmaskedPixelsUnchanged':bool(np.array_equal(background[all_mask==0],bgr[all_mask==0])),'exactBackgroundRecovery':False},'warning':'로컬 인페인팅은 가려진 픽셀의 근사 추정입니다. 질감·그림자·글자 잔상을 비교하고 확인하세요.'}

if __name__=='__main__':
 try:json.dump(repair(json.load(sys.stdin)),sys.stdout)
 except (ValueError,KeyError,TypeError,Image.DecompressionBombError) as e:
  # Known validation messages contain no image contents, credentials or paths.
  print(json.dumps({'error':str(e)[:180]}),file=sys.stderr);raise SystemExit(2)
