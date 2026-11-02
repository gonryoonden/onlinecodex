#!/usr/bin/env python3
"""Inspect the browser-created PPTX ZIP, package links and actual native objects."""
import sys, zipfile, posixpath
from pathlib import Path
from lxml import etree
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
p=Path(sys.argv[1])
if not p.is_file(): raise SystemExit("Missing browser-exported PPTX")
with zipfile.ZipFile(p) as z:
    damaged=z.testzip()
    if damaged:raise AssertionError(f"Damaged ZIP entry: {damaged}")
    parts=set(z.namelist())
    for name in parts:
        if name.endswith((".xml",".rels")):etree.fromstring(z.read(name))
    assert "[Content_Types].xml" in parts
    for name in parts:
        if not name.endswith(".rels"):continue
        root=etree.fromstring(z.read(name))
        if "/_rels/" in name:
            prefix,relfile=name.rsplit("/_rels/",1)
            origin=posixpath.join(prefix,relfile.removesuffix(".rels"))
        elif name=="_rels/.rels":origin=""
        else:continue
        for relationship in root:
            if relationship.get("TargetMode")=="External":continue
            target=relationship.get("Target")
            if not target:raise AssertionError(f"Missing relationship target in {name}")
            full=posixpath.normpath(posixpath.join(posixpath.dirname(origin),target.lstrip("/")))
            if target.startswith("/"):full=target.lstrip("/")
            if full not in parts:raise AssertionError(f"Broken relationship {name} -> {target} ({full})")
prs=Presentation(p)
assert len(prs.slides)==2
first=prs.slides[0]
assert len(first.shapes)==55,f"Expected 55 editable objects, got {len(first.shapes)}"
assert sum(s.shape_type==MSO_SHAPE_TYPE.PICTURE for s in first.shapes)>=10
assert any("산업안전보건교육" in s.text for s in first.shapes if s.has_text_frame)
for slide in prs.slides:
    for shape in slide.shapes:
        if shape.shape_type==MSO_SHAPE_TYPE.PICTURE:assert len(shape.image.blob)>40
print("Browser-exported PPTX validated: ZIP, relationships, images, 55 native objects")
