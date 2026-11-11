#!/usr/bin/env python3
"""Bounded verification driver; no LLM/API calls, no deployments, no arbitrary commands."""
import argparse, contextlib, datetime, fcntl, json, os, pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATE=ROOT/'docs/loop-engineering/state.json'
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def initial(): return dict(version=1,base='115b8ec',budget=24,attempts=[],phases={str(i):{'status':'pending'} for i in range(1,7)},halted=None,checkpoint='115b8ec')
def save(s):
 p=STATE.with_suffix('.tmp');p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n');os.replace(p,STATE)
def reserve(s,phase,gate,cause,hypothesis):
 if s['halted']: raise ValueError('HALTED: '+s['halted'])
 if len(s['attempts'])>=s['budget']: raise ValueError('BUDGET_EXHAUSTED')
 if any(a['status']=='running' for a in s['attempts']): raise ValueError('RECOVER_RUNNING_ATTEMPT_FIRST')
 restricted=phase==6 and gate in ('preview','sam-preview','sam-production') and all(s['phases'][str(i)]['status']=='passed' for i in range(1,5)) and s['phases']['5']['status']=='blocked' and any(a['phase']==5 and a['status']=='passed' for a in s['attempts'])
 if not restricted and any(s['phases'][str(i)]['status']!='passed' for i in range(1,phase)): raise ValueError('PREREQUISITE_NOT_PASSED')
 a=dict(id=len(s['attempts'])+1,phase=phase,gate=gate,cause=cause,hypothesis=hypothesis,status='running',started=now());s['attempts'].append(a);s['phases'][str(phase)]['status']='running';return a

def finish(s,a,ok,log):
 a.update(status='passed' if ok else 'failed',finished=now(),log=log)
 if not ok:
  streak=0
  for old in reversed(s['attempts']):
   if old['status']=='failed' and old['cause']==a['cause']: streak+=1
   else: break
  if streak>=3: s['halted']='SAME_CAUSE_THREE_FAILURES:'+a['cause']
 if len(s['attempts'])>=s['budget']: s['halted']=s['halted'] or 'BUDGET_EXHAUSTED'

def recover(s):
 for a in s['attempts']:
  if a['status']=='running': a.update(status='interrupted',finished=now());s['phases'][str(a['phase'])]['status']='pending'

def promote(s,phase):
 if any(s['phases'][str(i)]['status']!='passed' for i in range(1,phase)): raise ValueError('PREREQUISITE_NOT_PASSED')
 a=next((a for a in reversed(s['attempts']) if a['phase']==phase),None)
 if not a or a['status']!='passed': raise ValueError('LATEST_GATE_NOT_PASSED')
 s['phases'][str(phase)].update(status='passed',verifiedAttempt=a['id'])

GATES={
 'sam-export':[['python','scripts/evaluation/export-mobile-sam.py']],
 'sam-browser':[['npm','run','typecheck'],['npm','test'],['npm','run','lint'],['npx','playwright','test','tests/sam-browser.spec.ts']],
 'sam-acceptance':[['npm','run','typecheck'],['npm','test'],['npm','run','lint'],['npx','playwright','test','tests/sam-browser.spec.ts','tests/independent-layers.spec.ts','tests/preservation.spec.ts']],
 'sam-preview':[['python','scripts/evaluation/verify-sam-artifacts.py'],['python','-m','unittest','discover','-s','tests/loop','-v'],['npm','run','build']],
 'sam-production':[['npm','run','typecheck'],['npm','run','lint'],['npm','run','build'],['python','scripts/evaluation/test-sam-production.py']],
 'sam-probe':[['python','scripts/evaluation/probe-mobile-sam.py']],
 'governance':[['python','-m','unittest','discover','-s','tests/loop','-v'],['npm','test']],
 'contract':[['npm','run','typecheck'],['npm','test']],
 'browser':[['npm','run','typecheck'],['npm','test'],['npm','run','lint'],['npx','playwright','test','tests/independent-layers.spec.ts','tests/preservation.spec.ts']],
 'mask-review':[['npm','run','typecheck'],['npm','test'],['npx','playwright','test','tests/independent-layers.spec.ts','--grep','recorded REAL']],
 'release':[['npm','run','build']],
 'preview':[['python','-m','unittest','discover','-s','tests/loop','-v'],['npm','run','build']],
}
def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['init','status','recover','run','pass','block','checkpoint']);p.add_argument('phase',type=int,nargs='?',choices=range(1,7));p.add_argument('gate',nargs='?',choices=GATES);p.add_argument('--cause',default='');p.add_argument('--hypothesis',default='');p.add_argument('--reason',default='');args=p.parse_args()
 STATE.parent.mkdir(parents=True,exist_ok=True)
 with open(STATE.with_suffix('.lock'),'w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  s=json.loads(STATE.read_text()) if STATE.exists() else initial()
  if args.action=='init':
   if not STATE.exists():save(s)
  elif args.action=='recover':recover(s);save(s)
  elif args.action=='run':
   if not args.phase or not args.gate or not args.cause or not args.hypothesis: raise ValueError('phase, gate, cause and hypothesis required')
   a=reserve(s,args.phase,args.gate,args.cause,args.hypothesis);save(s)
   folder=ROOT/'evidence/studio/loop';folder.mkdir(parents=True,exist_ok=True);log=folder/f"attempt-{a['id']:02}.log"
   ok=True
   with log.open('w') as stream:
    for cmd in GATES[args.gate]:
     cwd=ROOT if cmd[0]=='python' else ROOT/'apps/studio';stream.write('COMMAND '+json.dumps(cmd)+'\n');stream.flush()
     env=os.environ.copy();env.setdefault('STUDIO_EVIDENCE_DIR',str(ROOT/'work/loop-browser/legacy'));env.setdefault('STUDIO_LOOP_EVIDENCE',str(ROOT/'work/loop-browser'))
     try:r=subprocess.run(cmd,cwd=cwd,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=600)
     except subprocess.TimeoutExpired:ok=False;break
     if r.returncode:ok=False;break
   finish(s,a,ok,str(log.relative_to(ROOT)));save(s);print(json.dumps(a));return 0 if ok else 1
  elif args.action=='pass':promote(s,args.phase);save(s)
  elif args.action=='block':
   if not args.reason:raise ValueError('reason required')
   s['phases'][str(args.phase)].update(status='blocked',reason=args.reason);save(s)
  elif args.action=='checkpoint':s['checkpoint']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip();save(s)
  print(json.dumps(s,ensure_ascii=False,indent=2));return 0
if __name__=='__main__':
 try:sys.exit(main())
 except ValueError as e:print(str(e),file=sys.stderr);sys.exit(2)
