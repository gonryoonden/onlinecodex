import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('runner',pathlib.Path(__file__).resolve().parents[2]/'scripts/pms-loop.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Runner(unittest.TestCase):
 def test_budget(self):
  s=m.initial()
  for i in range(24):a=m.reserve(s,1,'contract','x','test');m.finish(s,a,True,'log')
  with self.assertRaises(ValueError):m.reserve(s,1,'contract','x','test')
 def test_same_cause(self):
  s=m.initial()
  for i in range(3):a=m.reserve(s,1,'contract','same','test');m.finish(s,a,False,'log')
  self.assertIn('SAME_CAUSE',s['halted'])
  with self.assertRaises(ValueError):m.reserve(s,1,'contract','same','test')
 def test_recovery_does_not_refund_attempt(self):
  s=m.initial();m.reserve(s,1,'contract','x','test')
  with self.assertRaises(ValueError):m.reserve(s,1,'contract','x','test')
  m.recover(s);self.assertEqual(len(s['attempts']),1);self.assertEqual(s['attempts'][0]['status'],'interrupted')
 def test_prerequisite_and_failed_gate(self):
  s=m.initial()
  with self.assertRaises(ValueError):m.reserve(s,2,'contract','x','test')
  a=m.reserve(s,1,'contract','x','test');m.finish(s,a,False,'log')
  with self.assertRaises(ValueError):m.promote(s,1)
  a=m.reserve(s,1,'contract','x','test');m.finish(s,a,True,'log');m.promote(s,1);m.reserve(s,2,'contract','x','test')
