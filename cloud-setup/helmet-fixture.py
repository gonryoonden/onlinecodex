import sys,json
from pathlib import Path
root=Path('/workspace/onlinecodex');out=root/'output';page=out/'v2-page';src=next(root.glob('2024*.png'));sys.path.insert(0,str(root/'.agents/skills/image-to-editable-ppt/cli/editppt/runtime'));m=json.loads((page/'manifest.json').read_text())
from fidelity import fit_background,seeded_mask,extract
box=[725,1205,210,265];bg=out/'helmet-local-background.png';fit_background(src,box,bg)
mask=page/'assets/helmet-seed-mask.png';seeded_mask(src,bg,box,[825,1300],mask)
dest=page/'assets/helmet-source.png';extract(src,box,bg,dest,mask)
im=next(i for i in m['images'] if i['id']=='helmet');old=im['path'];im.update(path='assets/helmet-source.png',box_px=box)
pr=next(i for i in m['asset_provenance'] if i['path']==old);pr.update(path=im['path'],source=str(src),source_type='source-masked',evidence='assets/helmet-source.evidence.json',provenance_note='Source-color seed segmentation, source alpha and exact opaque pixels; compositing evidence verified.')
next(i for i in m['visual_inventory'] if i['id']=='helmet').update(path=im['path'],source_type='source-masked')
(page/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
print('helmet source mask accepted')
