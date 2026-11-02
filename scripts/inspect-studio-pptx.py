#!/usr/bin/env python3
"""Rebuild native samples and certify the actual browser-created alpha asset."""
import importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('studio_pptx',ROOT/'scripts/studio-pptx.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
OUT=ROOT/'evidence/studio/adapter';fixture=json.loads((ROOT/'tests/studio/fixtures/project.json').read_text())
for name,count in [('one-page',1),('two-pages',2)]:
 folder=OUT/name;folder.mkdir(parents=True,exist_ok=True);project={**fixture,'pages':fixture['pages'][:count]};(folder/f'{name}.pptx').write_bytes(adapter.build(project,folder))
project=json.loads((ROOT/'evidence/studio/synthetic-reconstructed-project.json').read_text());folder=OUT/'masked-browser';folder.mkdir(exist_ok=True);(folder/'masked-browser.pptx').write_bytes(adapter.build(project,folder))
proofs=[]
for manifest in sorted(folder.glob('page-*.json')):
 for provenance in json.loads(manifest.read_text())['asset_provenance']:
  if provenance['source_type']=='source-masked':
   errors=adapter.validate_masked(provenance['path'],provenance['evidence']);assert not errors,errors
   proofs.append({'page':manifest.name,'evidence':str(Path(provenance['evidence']).relative_to(ROOT)),'checks':errors})
assert proofs,'Expected a verified source mask from the synthetic browser scenario'
report={'source_type':'source-masked','checks':[],'mask_count':len(proofs),'proofs':proofs,'full_page_source_fidelity_certified':False}
(ROOT/'evidence/studio/mask-certification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
