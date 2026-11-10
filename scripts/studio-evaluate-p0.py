#!/usr/bin/env python3
"""Compare local private-review.spec.ts artifacts. Never upload inputs.
Usage: python scripts/studio-evaluate-p0.py /path/to/private-review-directory
Requires Pillow, numpy, scipy (evaluation only, not app dependencies).
"""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import uniform_filter


def scores(left, right):
    a, b = np.asarray(left, dtype=float), np.asarray(right, dtype=float)
    mean_a, mean_b = uniform_filter(a, (7, 7, 1)), uniform_filter(b, (7, 7, 1))
    var_a = (uniform_filter(a*a, (7, 7, 1))-mean_a**2)*49/48
    var_b = (uniform_filter(b*b, (7, 7, 1))-mean_b**2)*49/48
    cov = (uniform_filter(a*b, (7, 7, 1))-mean_a*mean_b)*49/48
    ssim = ((2*mean_a*mean_b+6.5025)*(2*cov+58.5225))/((mean_a**2+mean_b**2+6.5025)*(var_a+var_b+58.5225))
    return {"ssim": float(ssim[3:-3, 3:-3].mean()), "rgb_mae": float(abs(a-b).mean())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    root = parser.parse_args().directory
    out = root/"results"
    source = Image.open(root/"original.png").convert("RGB")
    rows, panels = {}, []
    for name in ["redraw", "preserved", "manual-cv"]:
        project = json.loads((out/f"{name}-project.json").read_text())
        width, height = project["width"], project["height"]
        scale = min(width/source.width, height/source.height)
        rw, rh = round(source.width*scale), round(source.height*scale)
        x, y = round((width-rw)/2), round((height-rh)/2)
        # Match each page's letterbox color; compare the source area separately.
        color = project["pages"][1]["background"].get("color", "#FFFFFF")
        reference = Image.new("RGB", (width, height), color)
        reference.paste(source.resize((rw, rh), Image.Resampling.LANCZOS), (x, y))
        actual = Image.open(out/f"{name}-before.png").convert("RGB")
        assert actual.size == reference.size
        trace = next(iter(project["diagnostics"].values()))
        reconstructed = next(s for s in trace["stages"] if s["name"] == "reconstructed")
        reviewed = next(s for s in trace["stages"] if s["name"] == "reviewed")
        rows[name] = {
            "full": scores(reference, actual),
            "source_area": scores(reference.crop((x,y,x+rw,y+rh)), actual.crop((x,y,x+rw,y+rh))),
            "content_roi": scores(reference.crop((0,60,width,628)), actual.crop((0,60,width,628))) if (width,height)==(960,640) else None,
            "counts": reconstructed["counts"], "retained_regions": len(reconstructed["omitted"]),
            "editable_regions": sum(o.get("role")=="editable" for o in reconstructed["objects"]),
            "reviewed_regions": len(reviewed["objects"]),
            "timing": json.loads((out/f"{name}-timing.json").read_text()),
            "semantic_recall": None, "mask_iou": None, "cer": None,
        }
        if not panels:
            panels.append(("SOURCE aligned (rounded <0.5px; Lanczos)", reference))
        panels.append(({"redraw":"SAME 36 OBJECTS / GLOBAL REDRAW", "preserved":"SAME 36 OBJECTS / PARTIAL PRESERVATION", "manual-cv":"MANUAL TITLE + GRABCUT ROBOT / NOT AUTOMATIC AI"}[name], actual))
    panel_width, panel_height = panels[0][1].size
    canvas = Image.new("RGB", (panel_width*2, (panel_height+40)*2), "white")
    draw = ImageDraw.Draw(canvas)
    for i, (label, im) in enumerate(panels):
        x, y = i%2*panel_width, i//2*(panel_height+40)
        draw.text((x+16,y+12), label, fill="black")
        canvas.paste(im,(x,y+35))
    canvas.save(out/"comparison.png")
    (out/"quality.json").write_text(json.dumps(rows,indent=2)+"\n")
    print(json.dumps(rows,indent=2))


if __name__ == "__main__":
    main()
