import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'api'))
sys.path.insert(0, str(ROOT / 'lib' / 'market'))


class InternalCallTest(unittest.TestCase):
    def setUp(self):
        self.saved = {k: os.environ.get(k) for k in ('INTERNAL_API_SECRET', 'CRON_SECRET')}
        for k in self.saved:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_only_the_server_secret_marks_a_call_internal(self):
        import pypsx
        self.assertFalse(pypsx._is_internal('anything'))  # no secret configured: never internal
        os.environ['CRON_SECRET'] = 'server-secret'
        self.assertTrue(pypsx._is_internal('server-secret'))
        self.assertFalse(pypsx._is_internal('server-secre'))
        self.assertFalse(pypsx._is_internal(''))
        os.environ['INTERNAL_API_SECRET'] = 'dedicated'
        self.assertTrue(pypsx._is_internal('dedicated'))
        self.assertFalse(pypsx._is_internal('server-secret'))


if __name__ == '__main__':
    unittest.main()
