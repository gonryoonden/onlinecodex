import json,hashlib,pathlib,collections
root=pathlib.Path(__file__).resolve().parents[2]
state=json.loads((root/'docs/loop-engineering/ux-state.json').read_text())
assert state['priorStateSHA256']==hashlib.sha256((root/'docs/loop-engineering/state.json').read_bytes()).hexdigest()
before=json.loads((root/'evidence/studio/loop/sam-browser/sam-browser-result.json').read_text())
checked=json.loads((root/'evidence/studio/loop/sam-acceptance/sam-browser-result.json').read_text())
rows=[]
for a in before['inventory']:
 b=next(b for b in checked['inventory'] if b['id']==a['id'])
 rows.append(dict(id=a['id'],type=a['type'],extraction=a.get('extraction'),withoutConfirmation=a.get('reason'),withConfirmation=b.get('reason'),visibleAfterConfirmation=b['status']=='generated',allocated=bool(a.get('elementId'))))
result=dict(source='cached actual Gemini; real browser MobileSAM, prior measured runs',candidates=len(rows),imageCandidates=sum(r['type']=='image' for r in rows),beforeReasons=dict(collections.Counter(r['withoutConfirmation'] for r in rows)),afterReasons=dict(collections.Counter(r['withConfirmation'] for r in rows)),rows=rows)
p=root/'evidence/studio/ux-loop/audit.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
assert len(rows)==46 and result['imageCandidates']==27
assert sum(r['allocated'] for r in rows)==45
print(json.dumps({k:v for k,v in result.items() if k!='rows'},ensure_ascii=False))
