#!/usr/bin/env python3
"""Local Next production-mode browser test. Never deploys or touches Production hosting."""
import os,subprocess,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];APP=ROOT/'apps/studio';out=ROOT/'work/ux-production';out.mkdir(parents=True,exist_ok=True)
env=os.environ.copy();env['STUDIO_TEST_BASE_URL']='http://127.0.0.1:3001';env['STUDIO_LOOP_EVIDENCE']=str(out)
with (out/'server.log').open('w') as log:
 server=subprocess.Popen(['npm','run','start','--','--port','3001'],cwd=APP,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:
  ready=False
  for _ in range(50):
   if server.poll() is not None:break
   try:
    with urllib.request.urlopen('http://127.0.0.1:3001',timeout=2) as r:
     if r.status==200:ready=True;break
   except Exception:time.sleep(.5)
  assert ready,'Local production server failed to start; see server.log'
  result=subprocess.run(['npx','playwright','test','tests/auto-edit.spec.ts'],cwd=APP,env=env,timeout=420)
  assert result.returncode==0,'Production-mode learned-mask browser test failed'
 finally:
  import signal
  try:os.killpg(server.pid,signal.SIGTERM);server.wait(timeout=10)
  except (ProcessLookupError,subprocess.TimeoutExpired):pass
