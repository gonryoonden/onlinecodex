"""Local-only synthetic checks. These are not AI/OCR/real-source quality evidence."""
import base64
import importlib.util
import io
from pathlib import Path
import sys
import unittest
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('studio_inpaint',ROOT/'scripts/studio-inpaint.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def decode(url):return np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))))

def payload():
 image=Image.new('RGB',(120,80),'#C0E0D0')
 draw=ImageDraw.Draw(image);draw.rectangle((40,25,70,50),fill='#204060')
 return {'image':module.png_url(image),'analysis':{'regions':[{'id':'object','type':'image','bbox':[300,250,350,450],'polygon':[[300,250],[650,250],[650,700],[300,700]]}]},'skip':[],'padding':2,'method':'telea','textMode':'boxes'}

class LocalRepairTests(unittest.TestCase):
 def test_preserves_every_unmasked_pixel(self):
  data=payload();result=module.repair(data);mask=decode(result['mask'])>0
  self.assertTrue(np.array_equal(decode(result['background'])[~mask],decode(data['image'])[~mask]))
  self.assertTrue(result['diagnostics']['unmaskedPixelsUnchanged'])
  self.assertFalse(result['diagnostics']['exactBackgroundRecovery'])
 def test_erases_synthetic_object_from_flat_background(self):
  result=module.repair(payload());bg=decode(result['background'])
  self.assertLess(np.max(np.abs(bg[35,55].astype(int)-np.array([192,224,208]))),8)
 def test_text_erased_from_object_source(self):
  data=payload();data['analysis']['regions'][0].pop('polygon');data['analysis']['regions'][0]['type']='text'
  result=module.repair(data)
  self.assertGreater(result['diagnostics']['textMaskPixels'],0)
  self.assertFalse(np.array_equal(decode(result['objectSource']),decode(data['image'])))
 def test_retains_object_source_when_no_text(self):
  data=payload();result=module.repair(data)
  self.assertTrue(np.array_equal(decode(result['objectSource']),decode(data['image'])))
 def test_refuses_excessive_or_empty_masks(self):
  data=payload();data['analysis']['regions'][0]={'id':'all','type':'image','bbox':[0,0,1000,1000]}
  with self.assertRaisesRegex(ValueError,'70%'):module.repair(data)
  data['skip']=['all']
  with self.assertRaises(ValueError):module.repair(data)
 def test_rejects_mime_mismatch(self):
  data=payload();data['image']=data['image'].replace('image/png','image/jpeg')
  with self.assertRaisesRegex(ValueError,'signature'):module.repair(data)

 def test_png_mask_respects_grayscale_and_transparency(self):
  region={'bbox':[0,0,1000,1000]}
  mask=Image.new('RGBA',(2,2),(255,255,255,0))
  mask.putpixel((1,1),(128,128,128,255))
  region['maskPng']=module.png_url(mask)
  result=module.region_mask(region,2,2)
  self.assertEqual(int(result[0,0]),0)
  self.assertEqual(int(result[1,1]),128)
