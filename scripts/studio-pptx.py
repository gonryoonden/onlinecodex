#!/usr/bin/env python3
"""Studio v1 -> fidelity-v2 manifest -> unchanged native PPTX builder."""
import base64,hashlib,io,json,math,re,sys,tempfile,zipfile
import numpy as np
from pathlib import Path
from PIL import Image,ImageOps
from lxml import etree
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.agents/skills/image-to-editable-ppt/cli/editppt/runtime'))
from build_pptx_from_manifest import write_deck
from fidelity import digest,validate_masked
NS={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}

def decode_asset(a,folder):
    if not re.fullmatch(r'[\w-]{1,100}',a['id'],flags=re.ASCII):raise ValueError('Invalid asset ID')
    mime=a['mime'];ext={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'}[mime]
    prefix=f'data:{mime};base64,'
    if not a['dataUrl'].startswith(prefix):raise ValueError('Asset MIME mismatch')
    data=base64.b64decode(a['dataUrl'][len(prefix):],validate=True)
    if len(data)>18*1024*1024:raise ValueError('Asset exceeds 18MB')
    im=Image.open(io.BytesIO(data))
    original_format=im.format
    im=ImageOps.exif_transpose(im)
    if im.size!=(a['width'],a['height']) or im.width*im.height>40_000_000:raise ValueError('Asset dimensions mismatch')
    if original_format!={'png':'PNG','jpeg':'JPEG','webp':'WEBP'}[ext]:raise ValueError('Invalid image signature')
    out=folder/f'{a["id"]}.png';im.convert('RGBA').save(out)
    return out

def mask_evidence(project,page,element,paths,asset_path):
    """Certify only actual source pixels using the preserved fidelity validator."""
    provenance=element.get('provenance') or {}
    if 'polygon-mask' not in provenance.get('method',''):return None, ['not a polygon-masked source asset']
    if provenance.get('backgroundWarning'):return None, ['unclean background']
    source_id=provenance.get('source');box=provenance.get('sourcePixels')
    if source_id not in paths or not box or any(int(v)!=v for v in box):return None, ['integer source ROI required']
    source=paths[source_id];source_image=Image.open(source).convert('RGB')
    if source_image.width*source_image.height>8_000_000:return None, ['source exceeds optional certification memory limit']
    proof_id=hashlib.sha256((page['id']+'|'+element['id']+'|'+asset_path.name).encode()).hexdigest()[:24]
    proof_base=asset_path.with_name('proof-'+proof_id)
    asset=Image.open(asset_path).convert('RGBA');mask=asset.getchannel('A');mask_path=proof_base.with_suffix('.mask.png');mask.save(mask_path)
    bg=page['background'];background_path=proof_base.with_suffix('.background.png')
    if bg['type']=='solid':Image.new('RGB',source_image.size,bg['color']).save(background_path)
    else:
        yy,xx=np.mgrid[0:source_image.height,0:source_image.width];angle=math.radians(bg['angle']);dx,dy=math.cos(angle),math.sin(angle)
        projection=xx*dx+yy*dy;low=min(0,(source_image.width-1)*dx)+min(0,(source_image.height-1)*dy);span=abs((source_image.width-1)*dx)+abs((source_image.height-1)*dy)
        t=np.clip((projection-low)/max(1,span),0,1)[:,:,None]
        colors=[np.array([int(bg[key][i:i+2],16) for i in (1,3,5)]) for key in ('from','to')]
        Image.fromarray(np.uint8(np.rint(colors[0]*(1-t)+colors[1]*t))).save(background_path)
    evidence_path=proof_base.with_suffix('.evidence.json')
    evidence={'source':source.name,'source_sha256':digest(source),'source_box':[int(v) for v in box],'background':background_path.name,'background_sha256':digest(background_path),'mask':mask_path.name,'mask_sha256':digest(mask_path),'asset_sha256':digest(asset_path),'method':'Studio user polygon; original integer source pixels; verified by unchanged fidelity.validate_masked','checks':[]}
    evidence_path.write_text(json.dumps(evidence,indent=2))
    errors=validate_masked(asset_path,evidence_path)
    return (evidence_path if not errors else None),errors

def manifest_for(project,page,paths):
    width,height=project['width'],project['height'];bg=page['background']
    background=bg['color'] if bg['type']=='solid' else {'angle':bg['angle'],'stops':[{'position':0,'color':bg['from']},{'position':1,'color':bg['to']}]}
    m={'slide':{'width':width/96,'height':height/96,'background':background},'content_box':{'left':0,'top':0,'width':width/96,'height':height/96},'source':{'width_px':width,'height_px':height},'text_inventory':[],'visual_inventory':[],'background_strategy':{'mode':'native-or-script','source_consistency_contract':'Studio user-edited page','removed_foreground':[],'comparison_note':'Native background selected by user'},'quality_checks':{'font_size_calibrated':False,'visual_inventory_matched':False,'background_strategy_checked':False,'shape_corner_geometry_checked':False},'text_boxes':[],'shapes':[],'images':[],'asset_provenance':[],'page_strategy':'studio-native-edited-document'}
    ordered=[]
    for z,e in enumerate(page['elements']):
        if not e['visible']:continue
        typ=e['type'];common={'id':e['id'],'box_px':[e['x'],e['y'],e['width'],e['height']],'z_index':z,'rotation':e['rotation']}
        if typ=='text':
            m['text_inventory'].append(e['text']);m['text_boxes'].append({**common,'text':e['text'].upper() if e.get('uppercase') else e['text'],'font':e['fontFamily'],'font_size':e['fontSize']*.75,'color':e['fill'],'bold':e['bold'],'italic':e['italic'],'align':e['align'],'lang':'ko-KR','char_spacing':e.get('letterSpacing',0)*.75,'fit_text':False,'wrap':'square','line_height':e['lineHeight']})
        elif typ in ('rect','ellipse','line'):
            item={**common,'type':typ,'fill':e.get('fill','none'),'stroke':'none' if e.get('stroke')=='transparent' or e['strokeWidth']==0 else e.get('stroke','none'),'stroke_width':e['strokeWidth']*.75}
            if typ=='rect' and e['cornerRadius']>0:item.update(type='roundRect',source_corner_radius_px=e['cornerRadius'])
            if typ=='line':item.update(points_px=[e['x'],e['y'],e['x']+e['width'],e['y']],dash='dash' if e['dashed'] else 'solid')
            m['shapes'].append(item)
        elif typ=='image':
            asset_id=e.get('assetId');asset=project['assets'].get(asset_id)
            if not asset or asset['dataUrl']!=e['src']:raise ValueError('Missing or inconsistent asset')
            asset_path=str(paths[asset_id]);m['images'].append({**common,'path':asset_path,'alt':e.get('name') or e['id']})
            method=e.get('provenance',{}).get('method','user-provided');source_type='user-provided' if asset.get('original') else 'user-approved-rasterization'
            evidence,errors=mask_evidence(project,page,e,paths,Path(asset_path))
            if evidence:source_type='source-masked'
            record={'path':asset_path,'source':str(paths.get(e.get('provenance',{}).get('source'),paths[asset_id])),'source_type':source_type,'provenance_note':f'Studio asset: {method}. '+('Source alpha and opaque pixels verified by fidelity engine.' if evidence else 'Not source-masked certified: '+ '; '.join(errors))}
            if evidence:record['evidence']=str(evidence)
            m['asset_provenance'].append(record)
            m['visual_inventory'].append({'id':e['id'],'role':'background' if e.get('provenance',{}).get('backgroundWarning') else 'foreground','path':asset_path,'source_type':source_type})
        else:raise ValueError('Unsupported native object')
        ordered.append(e)
    return m,ordered

def patch_native_transforms(data,ordered_pages):
    """Adapter-only opacity and Konva origin rotation support. Engine untouched."""
    source=zipfile.ZipFile(io.BytesIO(data));out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as target:
        for name in source.namelist():
            b=source.read(name);match=re.fullmatch(r'ppt/slides/slide(\d+)\.xml',name)
            if match:
                root=etree.fromstring(b);tree=root.find('p:cSld/p:spTree',NS);nodes=[n for n in tree if n.tag in [f'{{{NS["p"]}}}sp',f'{{{NS["p"]}}}pic']]
                for node,e in zip(nodes,ordered_pages[int(match.group(1))-1],strict=True):
                    xfrm=node.find('p:spPr/a:xfrm',NS);angle=float(e['rotation']);r=math.radians(angle)
                    if xfrm is not None:
                        xfrm.set('rot',str(round(angle*60000)));off=xfrm.find('a:off',NS)
                        if e['type']!='ellipse':
                            cx,cy=e['width']/2,e['height']/2
                            off.set('x',str(round((e['x']+cx*math.cos(r)-cy*math.sin(r)-cx)*9525)))
                            off.set('y',str(round((e['y']+cx*math.sin(r)+cy*math.cos(r)-cy)*9525)))
                    alpha=str(round(e['opacity']*100000))
                    if e['type']=='image':
                        blip=node.find('p:blipFill/a:blip',NS);etree.SubElement(blip,f'{{{NS["a"]}}}alphaModFix',amt=alpha)
                    else:
                        for color_node in node.findall('.//a:srgbClr',NS):etree.SubElement(color_node,f'{{{NS["a"]}}}alpha',val=alpha)
                    if e['type']=='text':
                        for rp in node.findall('.//a:rPr',NS):
                            if e.get('underline'):rp.set('u','sng')
                            if e.get('strike'):rp.set('strike','sngStrike')
                b=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
            target.writestr(name,b)
    return out.getvalue()

def build(project,work):
    work=work.resolve()
    if project.get('schemaVersion')!=1 or not 1<=len(project['pages'])<=30:raise ValueError('Invalid project')
    if not 32<=project['width']<=8000 or not 32<=project['height']<=8000:raise ValueError('Invalid canvas')
    paths={key:decode_asset(asset,work) for key,asset in project['assets'].items()}
    entries=[];ordered=[]
    for index,page in enumerate(project['pages']):
        m,els=manifest_for(project,page,paths);mp=work/f'page-{index+1}.json';mp.write_text(json.dumps(m,ensure_ascii=False,indent=2));entries.append({'manifest':m,'manifest_path':str(mp)});ordered.append(els)
    out=work/'output.pptx';write_deck({'slide':entries[0]['manifest']['slide']},entries,out,[])
    return patch_native_transforms(out.read_bytes(),ordered)

if __name__=='__main__':
    project=json.load(sys.stdin)
    with tempfile.TemporaryDirectory(prefix='magic-studio-') as folder:sys.stdout.buffer.write(build(project,Path(folder)))
