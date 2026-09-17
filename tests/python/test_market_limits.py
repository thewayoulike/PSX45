import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'api'))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'lib' / 'market'))
from market_limits import validate_query
from pypsx import run_market

class MarketLimits(unittest.TestCase):
    def test_bounded_symbols(self):
        self.assertIsNone(validate_query({'mode':'quotes','symbols':'OGDC,HUBC'}))
        self.assertIsNotNone(validate_query({'mode':'quotes','symbols':','.join(['OGDC']*21)}))
        self.assertIsNotNone(validate_query({'mode':'quote','symbol':'../x'}))
        self.assertIsNotNone(validate_query({'mode':'analysis','symbol':'OGDC','period':'100y'}))
        self.assertIsNotNone(validate_query({'mode':'intraday','symbol':'OGDC','interval':'1s'}))
    def test_sdk_process_has_hard_deadline(self):
        with patch('pypsx.subprocess.run', side_effect=subprocess.TimeoutExpired('python',35)) as run:
            with self.assertRaises(subprocess.TimeoutExpired): run_market({'mode':'quote','symbol':'OGDC'})
            self.assertEqual(run.call_args.kwargs['timeout'],35)

if __name__ == '__main__': unittest.main()
