import sys,unittest,tempfile,json
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'.agents/skills/image-to-editable-ppt/cli/editppt/runtime'))
from fidelity import mask_checks,extract,validate_masked,ssim
from build_pptx_from_manifest import slide_background_xml,text_box_xml
class FidelityTests(unittest.TestCase):
 def test_rectangular_crop_rejected(self):
  self.assertTrue(mask_checks(np.full((20,20),255,dtype='uint8')))
  a=np.zeros((40,40),dtype='uint8');a[5:35,5:35]=255;self.assertTrue(mask_checks(a))
 def test_ssim(self):
  a=np.zeros((32,32,3));self.assertAlmostEqual(ssim(a,a),1);self.assertLess(ssim(a,a+100),.01)
 def test_gradient_and_lang(self):
  x=slide_background_xml({'background':{'stops':[{'position':0,'color':'#FFFFFF'},{'position':1,'color':'#123456'}]}});self.assertIn('a:gradFill',x)
  self.assertIn('ko-KR',text_box_xml(2,{'text':'한글','char_spacing':.3}))
 def test_pixel_provenance(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);bg=np.full((40,40,3),200,dtype='uint8');src=bg.copy();yy,xx=np.mgrid[:40,:40];src[(xx-20)**2+(yy-20)**2<100]=50
   Image.fromarray(bg).save(p/'bg.png');Image.fromarray(src).save(p/'src.png')
   extract(p/'src.png',[0,0,40,40],p/'bg.png',p/'asset.png')
   self.assertEqual(validate_masked(p/'asset.png',p/'asset.evidence.json'),[])
   im=Image.open(p/'asset.png');im.putpixel((15,15),(255,0,0,255));im.save(p/'asset.png')
   self.assertTrue(validate_masked(p/'asset.png',p/'asset.evidence.json'))
if __name__=='__main__':unittest.main()

class SafetyTests(unittest.TestCase):
 def test_subject_colors_not_erased(self):
  from remove_chroma_key import _apply_alpha_to_image
  im=Image.new('RGBA',(2,1));im.putdata([(251,232,233,255),(252,208,109,255)])
  _apply_alpha_to_image(im,key=(252,2,1),tolerance=12,spill_cleanup=True,soft_matte=True,transparent_threshold=12,opaque_threshold=96)
  self.assertEqual(list(im.getdata()),[(251,232,233,255),(252,208,109,255)])
 def test_text_geometry_and_plan(self):
  from fidelity import compare_text,regression_plan
  a=[{'id':'a','text':'한글','box_px':[0,0,10,10]}];b=[{'id':'a','text':'한굴','box_px':[5,0,10,10]}]
  r=compare_text(a,b)[0];self.assertFalse(r['text_equal']);self.assertLess(r['box_iou'],1)
  self.assertEqual(regression_plan({'ssim':.8,'regions':[{'id':'a','ssim':.9}]},{'ssim':.81,'regions':[{'id':'a','ssim':.7}]})['reprocess_regions'],['a'])
 def test_bad_gradient(self):
  with self.assertRaises(ValueError):slide_background_xml({'background':{'stops':[{'position':.1,'color':'#FFFFFF'}]}})
