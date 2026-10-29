import sys,json
from pathlib import Path
p=Path('/workspace/onlinecodex');sys.path.insert(0,str(p/'.agents/skills/image-to-editable-ppt/cli/editppt/runtime'))
from fidelity import qa,regression_plan,compare_text
regions=[{'id':'title','box':[240,20,1120,140]},{'id':'left-detail','box':[40,180,730,370]},{'id':'right-detail','box':[810,180,740,370]},{'id':'bottom','box':[40,560,1510,300]}]
src=next(p.glob('2024*.png'));a=qa(src,p/'output/actual-preview.png',p/'output/qa-v1',regions);b=qa(src,p/'output/v2-render/preview.png',p/'output/qa-v2',regions)
(p/'output/qa-v2/regression-plan.json').write_text(json.dumps(regression_plan(a,b),indent=2))
print(a['ssim'],b['ssim'],a['rgb_mae'],b['rgb_mae'])
