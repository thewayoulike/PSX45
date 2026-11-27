import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lib" / "market"))

import pypsx_lib
from market_limits import validate_query


class ActionRows(unittest.TestCase):
    def test_bonus_right_split_rows(self):
        row = pypsx_lib.normalize_action_row({"ex_date": pd.Timestamp("2026-03-12"), "kind": "bonus+dividend", "bonus_pct": 10, "dividend_rs": 2.5, "applied": True})
        self.assertEqual(row, {"exDate": "2026-03-12", "kind": ["bonus", "dividend"], "bonusPercent": 10.0, "dividendRs": 2.5})
        split = pypsx_lib.normalize_action_row({"ex_date": "2026-05-05", "kind": "split", "price_factor": 0.5})
        self.assertEqual(split["splitRatio"], 2.0)
        quarantined = pypsx_lib.normalize_action_row({"ex_date": "2026-06-01", "kind": "right", "right_pct": 20, "applied": False, "reject_reason": "unverified"})
        self.assertEqual((quarantined["applied"], quarantined["rejectReason"]), (False, "unverified"))

    def test_batch_drops_dividend_only_rows(self):
        mod = types.ModuleType("pypsx")
        mod.get_corporate_actions = lambda symbol, **kw: pd.DataFrame({"ex_date": ["2026-01-01", "2026-03-12"], "kind": ["dividend", "bonus"], "bonus_pct": [None, 10], "dividend_rs": [3, None]})
        with patch.object(pypsx_lib, "_require_pypsx_keys", return_value=None), patch.dict(sys.modules, {"pypsx": mod}):
            payload = pypsx_lib.get_corporate_actions_batch("hubc,OGDC")
        self.assertEqual([a["exDate"] for a in payload["actions"]["HUBC"]], ["2026-03-12"])
        self.assertIn("bonus_pct", payload["columns"])


class Calendar(unittest.TestCase):
    def test_open_flag_shape(self):
        df = pd.DataFrame({"date": ["2026-11-09", "2026-11-10"], "is_open": [False, True], "holiday": ["Iqbal Day", ""]})
        self.assertEqual(pypsx_lib.calendar_holidays(df, "2026-01-01", "2026-12-31"), [{"date": "2026-11-09", "note": "Iqbal Day"}])

    def test_sessions_only_shape(self):
        df = pd.DataFrame({"session_date": ["2026-11-06", "2026-11-10"]})  # Mon 9 Nov missing
        self.assertEqual([h["date"] for h in pypsx_lib.calendar_holidays(df, "2026-01-01", "2026-12-31")], ["2026-11-09"])


class Limits(unittest.TestCase):
    def test_new_modes(self):
        self.assertIsNone(validate_query({"mode": "actions", "symbols": "HUBC,OGDC"}))
        self.assertIsNotNone(validate_query({"mode": "actions", "symbols": ",".join(["A"] * 11)}))
        self.assertIsNone(validate_query({"mode": "calendar", "year": "2026"}))
        self.assertIsNotNone(validate_query({"mode": "calendar", "year": "abc"}))
        self.assertIsNone(validate_query({"mode": "resolve", "symbols": "LINDE"}))


if __name__ == "__main__":
    unittest.main()
