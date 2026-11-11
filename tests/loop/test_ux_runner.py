import importlib.util,pathlib,unittest,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ux',ROOT/'scripts/pms-ux-loop.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class UXRunner(unittest.TestCase):
 def test_separate_budget_preserves_old(self):
  old=(ROOT/'docs/loop-engineering/state.json').read_bytes();s=m.loop.initial()
  self.assertEqual(s['budget'],12);self.assertEqual(s['priorStateSHA256'],hashlib.sha256(old).hexdigest())
  for i in range(12):a=m.loop.reserve(s,1,'audit','cause','hypothesis');m.loop.finish(s,a,True,'log')
  with self.assertRaises(ValueError):m.loop.reserve(s,1,'audit','cause','hypothesis')
  self.assertEqual(old,(ROOT/'docs/loop-engineering/state.json').read_bytes())
 def test_three_failures_halt_and_interruption_consumes(self):
  s=m.loop.initial()
  for i in range(3):a=m.loop.reserve(s,1,'audit','same','hypothesis');m.loop.finish(s,a,False,'log')
  self.assertIn('SAME_CAUSE',s['halted'])
  s=m.loop.initial();m.loop.reserve(s,1,'audit','interrupt','hypothesis');m.loop.recover(s)
  self.assertEqual(len(s['attempts']),1);self.assertEqual(s['attempts'][0]['status'],'interrupted')
