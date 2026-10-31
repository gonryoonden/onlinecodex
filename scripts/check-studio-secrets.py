#!/usr/bin/env python3
"""Check staged additions without ever printing candidate secret contents."""
import json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
paths=subprocess.check_output(['git','diff','--cached','--name-only','--diff-filter=ACMR','-z'],cwd=ROOT).decode().split('\0');findings=[];checked=0
patterns=[re.compile(r'AIza[0-9A-Za-z_-]{30,}'),re.compile(r'gh[pousr]_[0-9A-Za-z]{30,}'),re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),re.compile(r'sk-(?:proj-)?[0-9A-Za-z_-]{30,}')]
for name in filter(None,paths):
 if name.startswith('.env') and name!='.env.example':findings.append({'file':name,'reason':'environment file must not be staged'})
 raw=subprocess.check_output(['git','show',':'+name],cwd=ROOT)
 if b'\0' in raw[:4096]:continue
 try:text=raw.decode('utf8')
 except UnicodeDecodeError:continue
 checked+=1
 for line_num,line in enumerate(text.splitlines(),1):
  if any(pattern.search(line) for pattern in patterns):findings.append({'file':name,'line':line_num,'reason':'candidate credential/private key'})
report={'stagedTextFilesChecked':checked,'credentialPatternsFound':findings,'passed':not findings,'scope':'Pattern scan of staged text plus manual review of synthetic/public-source fixtures; not a guarantee against every possible secret'}
(ROOT/'evidence/studio/secrets-scan.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));raise SystemExit(bool(findings))
