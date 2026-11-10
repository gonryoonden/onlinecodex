#!/usr/bin/env python3
"""Check presentation-only PPTX independently: one full-page image per slide.
Does NOT certify native editability, OCR, segmentation or Microsoft Office GUI.
"""
import argparse
import io
import json
import runpy
import zipfile
from pathlib import Path
from PIL import Image
from pptx import Presentation


def verify(file, reference=None):
    check = runpy.run_path(str(Path(__file__).with_name('studio-verify-native.py')))['check_package']
    with zipfile.ZipFile(file) as z:
        check(z)
    prs = Presentation(file)
    assert len(prs.slides) > 0, 'No slides'
    images = []
    for n, slide in enumerate(prs.slides, 1):
        assert len(slide.shapes) == 1, f'Slide {n}: must have exactly one page image'
        picture = slide.shapes[0]
        assert picture.shape_type == 13, f'Slide {n}: not a picture'
        assert 914400 <= prs.slide_width <= 51206400 and 914400 <= prs.slide_height <= 51206400, 'Invalid Office slide dimensions'
        assert picture.left >= 0 and picture.top >= 0 and picture.width > 0 and picture.height > 0, 'Invalid image geometry'
        assert abs(2*picture.left+picture.width-prs.slide_width) <= 2 and abs(2*picture.top+picture.height-prs.slide_height) <= 2, 'Image is not centered'
        assert abs(picture.width-prs.slide_width) <= 2 or abs(picture.height-prs.slide_height) <= 2, 'Image does not fit the slide'
        data = picture.image.blob
        image = Image.open(io.BytesIO(data))
        w, h = image.size
        image.verify()
        assert w*h <= 16_000_000 and max(w,h) <= 8192, 'Raster exceeds pixel budget'
        assert abs((w/h)/(picture.width/picture.height)-1) <= 1/max(1,h)+1/max(1,w), 'Image aspect ratio mismatch'
        if reference:
            assert data == (reference/f'page-{n}.png').read_bytes(), f'Slide {n}: PNG bytes differ'
        images.append({'page': n, 'width': w, 'height': h, 'bytes': len(data)})
    return {'pages': len(images), 'images': images, 'native_editability': False,
            'reference_bytes_equal': True if reference else None}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--reference-dir', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.file, args.reference_dir)))
