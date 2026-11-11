#!/usr/bin/env python3
"""Separate authorized 12-attempt loop. Old 24-attempt state is read-only."""
import importlib.util, pathlib, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('old_loop',ROOT/'scripts/pms-loop.py')
loop=importlib.util.module_from_spec(spec);spec.loader.exec_module(loop)
old_initial=loop.initial
loop.STATE=ROOT/'docs/loop-engineering/ux-state.json'
def initial():
 s=old_initial();s.update(base='f5db094',checkpoint='f5db094',budget=12,priorStateSHA256=hashlib.sha256((ROOT/'docs/loop-engineering/state.json').read_bytes()).hexdigest());return s
loop.initial=initial
# Original driver writes an independent evidence folder via this isolated root proxy.
loop.GATES.clear();loop.GATES.update({
 'audit':[['python','scripts/evaluation/ux-audit.py']],
 'policy':[['npm','run','typecheck'],['npm','test']],
 'auto':[['npm','run','typecheck'],['npm','test'],['npm','run','lint'],['npx','playwright','test','tests/auto-edit.spec.ts']],
 'regression':[['npm','test'],['npx','playwright','test','tests/independent-layers.spec.ts','tests/preservation.spec.ts','tests/sam-cancel.spec.ts']],
 'assessment':[['python','scripts/evaluation/ux-results.py'],['python','-m','unittest','discover','-s','tests/loop','-v'],['npm','run','typecheck'],['npm','run','lint']],
 'preview':[['npx','playwright','test','tests/auto-edit.spec.ts']],
 'release':[['python','-m','unittest','discover','-s','tests/loop','-v'],['npm','run','typecheck'],['npm','test'],['npm','run','lint'],['npx','playwright','test','tests/auto-edit.spec.ts','tests/auto-cancel.spec.ts','tests/independent-layers.spec.ts','tests/preservation.spec.ts','tests/sam-cancel.spec.ts'],['python','scripts/evaluation/verify-ux-artifacts.py'],['npm','run','build']],
})
# Namespace attempt logs without changing the original runner or its history.
source=(ROOT/'scripts/pms-loop.py').read_text().split('def main():',1)[1].split("if __name__",1)[0]
source='def ux_main():'+source.replace("folder=ROOT/'evidence/studio/loop'","folder=ROOT/'evidence/studio/ux-loop'")
exec(source,loop.__dict__)
if __name__=='__main__':
 try:raise SystemExit(loop.ux_main())
 except ValueError as e:raise SystemExit(str(e))
