#!/usr/bin/env python3
"""Execute official LayerD SVG serializer only; never model inference.
Imports individual pure export modules without executing package __init__ (which
loads torch). Namespace shells do not mock any serializer/model implementation.
Usage: python layerd-export-probe.py LAYERD_CHECKOUT OUT
"""
from pathlib import Path
import sys,types,importlib.util,json,xml.etree.ElementTree as ET
from PIL import Image
checkout=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
source=checkout/'src/layerd'
for name,folder in [('layerd',source),('layerd.export',source/'export')]:
 package=types.ModuleType(name);package.__path__=[str(folder)];sys.modules[name]=package
for name,file in [('layerd.types','types.py'),('layerd.export.base','export/base.py'),('layerd.export.svg','export/svg.py')]:
 spec=importlib.util.spec_from_file_location(name,source/file);module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module)
svg=sys.modules['layerd.export.svg']
elements=[{'id':i,'type':kind,'image':Image.new('RGBA',(20,25),(30,80,130,180)),'box':{'x_min':i*30,'y_min':10,'x_max':i*30+20,'y_max':35}}for i,kind in enumerate(['text','vector','image'])]
text=svg.SVGBuilder().export(elements,(100,50));(out/'official-serializer.svg').write_text(text)
root=ET.fromstring(text);tags=[node.tag.split('}')[-1]for node in root];assert tags==['image']*3
parsed=svg.SVGParser().parse(text);assert len(parsed)==3
for a,b in zip(elements,parsed):assert a['box']==b['box'] and a['image'].tobytes()==b['image'].tobytes()
result={'scope':'official SVG serializer and parser ONLY; synthetic supplied elements; NO inference','elements':len(parsed),'tags':tags,'nativeText':0,'nativeVectors':0,'roundTripPixelsAndBoxes':True,'psdRuntime':'not executed; source uses create_pixel_layer'}
(out/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
