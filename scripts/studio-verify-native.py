#!/usr/bin/env python3
"""Independent PPTX package + native table/chart checks. Never prints cell text.
Usage: python scripts/studio-verify-native.py file.pptx --expect-tables 1
"""
import argparse, io, json, posixpath, zipfile
from pathlib import Path
from lxml import etree
from pptx import Presentation
NS={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','c':'http://schemas.openxmlformats.org/drawingml/2006/chart','s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def xml(data):
    return etree.fromstring(data,etree.XMLParser(resolve_entities=False,no_network=True))
def check_package(z):
    assert z.testzip() is None, 'Corrupt ZIP'
    parts=set(z.namelist())
    for name in parts:
        if name.endswith(('.xml','.rels')): xml(z.read(name))
        if not name.endswith('.rels'): continue
        if '/_rels/' in name:
            prefix,leaf=name.rsplit('/_rels/',1);origin=posixpath.join(prefix,leaf.removesuffix('.rels'))
        elif name=='_rels/.rels': origin=''
        else: continue
        for rel in xml(z.read(name)):
            if rel.get('TargetMode')=='External': continue
            target=rel.get('Target');assert target, 'Missing relationship target'
            path=target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(origin),target))
            assert path in parts, f'Broken internal relationship: {name} -> {path}'
def verify(file):
    report={'pages':0,'text':0,'pictures':0,'tables':0,'cells':0,'charts':0,'chart_points':0,'embedded_workbooks':0}
    with zipfile.ZipFile(file)as z:
        check_package(z)
        for name in z.namelist():
            if name.startswith('ppt/charts/') and name.endswith('.xml'):
                root=xml(z.read(name));values=root.xpath('//c:numCache/c:pt/c:v/text()',namespaces=NS)
                labels=root.xpath('//c:cat/c:strRef/c:strCache/c:pt/c:v/text()',namespaces=NS)
                leaf=Path(name).stem;book=f'ppt/embeddings/{leaf}.xlsx';assert book in z.namelist(),'Chart must contain editable workbook'
                with zipfile.ZipFile(io.BytesIO(z.read(book)))as b:
                    check_package(b);sheet=xml(b.read('xl/worksheets/sheet1.xml'))
                    rows=sheet.xpath('//s:row',namespaces=NS)[1:]
                    numbers=[r.xpath('s:c[2]/s:v/text()',namespaces=NS)[0]for r in rows]
                    words=[r.xpath('s:c[1]/s:is/s:t/text()',namespaces=NS)[0]for r in rows]
                    assert [float(v)for v in values]==[float(v)for v in numbers], 'Chart cache/workbook numeric mismatch'
                    assert labels==words, 'Chart cache/workbook label mismatch'
                report['embedded_workbooks']+=1
    prs=Presentation(file);report['pages']=len(prs.slides)
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_table:
                report['tables']+=1;t=shape.table;report['cells']+=len(t.rows)*len(t.columns)
                assert all(c.width>0 for c in t.columns) and all(r.height>0 for r in t.rows),'Invalid table geometry'
            elif shape.has_chart:
                report['charts']+=1;assert len(shape.chart.series)==1,'Only one verified series supported'
                report['chart_points']+=len(shape.chart.series[0].values)
            elif shape.has_text_frame: report['text']+=1
            elif shape.shape_type==13: report['pictures']+=1;assert shape.image.blob
            if shape._element.tag.endswith('graphicFrame'):
                assert shape.has_table or shape.has_chart,'Unrecognized graphic frame URI/type'
    return report
if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('file',type=Path);ap.add_argument('--expect-tables',type=int);ap.add_argument('--expect-charts',type=int);args=ap.parse_args()
    result=verify(args.file)
    if args.expect_tables is not None: assert result['tables']==args.expect_tables,'Wrong native table count'
    if args.expect_charts is not None: assert result['charts']==args.expect_charts,'Wrong native chart count'
    print(json.dumps(result))
