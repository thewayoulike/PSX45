import io
import json
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout

import _load

import psx

entry = _load.load("psx-trader-entry", "entry")
ex = _load.load("psx-trader-exit", "exit")
FIVE = psx.FIVE_MS
CFG = dict(psx.DEFAULT_CONFIG)


def session(day, family=None):
    s = psx.sessions(day)
    s = next(x for x in s if family is None or x["family"] == family)
    return dict(s, day=day)


def daily(closes, end_day="2026-10-30", hi=1.0, lo=1.0):
    """Daily candles ending on end_day (one a calendar day, which is fine for these rules)."""
    t_end = psx.ms(psx.parse_pkt(end_day))
    n = len(closes)
    return [{"t": t_end - (n - 1 - i) * 86400000, "o": c, "h": c + hi, "l": c - lo, "c": c, "v": 1000.0}
            for i, c in enumerate(closes)]


def run(argv):
    out = io.StringIO()
    with redirect_stdout(out):
        rc = ex.main(argv)
    return rc, out.getvalue()


class ExitPureTests(unittest.TestCase):
    def setUp(self):
        self.mon = session("2026-11-02")
        self.t = psx.ms(psx.parse_pkt("2026-11-02 10:00"))
        self.rng = {"high": 108.5, "low": 107.0, "mid": 107.75}

    def test_stop_too_close_refused(self):
        with self.assertRaises(ex.Refused) as cm:
            ex.make_plan("TEST", 109.0, self.mon, self.t, self.rng, "price:108.95", "2R", daily([100.0] * 5), [], CFG)
        self.assertIn(ex.STOP_TOO_CLOSE, str(cm.exception))
        need = ex.min_stop_distance(109.0, 108.95, 0.15, 0.05)
        self.assertAlmostEqual(need, 0.5064, 4)       # round-trip cost beats two price steps
        self.assertEqual(ex.min_stop_distance(109.0, 108.95, 0, 0), 0.02)

    def test_stop_above_entry_and_target_below(self):
        with self.assertRaises(ex.Refused):
            ex.make_plan("TEST", 109.0, self.mon, self.t, self.rng, "price:109.5", "2R", daily([100.0] * 5), [], CFG)
        with self.assertRaises(ex.Refused):
            ex.make_plan("TEST", 109.0, self.mon, self.t, self.rng, "or-low", "price:108", daily([100.0] * 5), [], CFG)

    def test_target_capped_by_band(self):
        # Prior close 100 -> estimated upper limit 110. Entry 109, stop 107 (range low), 2R = 113.
        p = ex.make_plan("TEST", 109.0, self.mon, self.t, self.rng, "or-low", "2R", daily([100.0] * 5), [], CFG)
        self.assertEqual((p["stop"], p["target"], p["target_requested"]), (107.0, 110.0, 113.0))
        self.assertEqual(p["target_bound_by"], "estimated upper price limit")
        self.assertEqual(p["band"]["upper"], 110.0)
        self.assertEqual(p["target_r"], 0.5)
        self.assertEqual(p["flat_by"], "15:25")
        self.assertTrue(any("cut to Rs. 110.00" in w for w in p["warnings"]))

    def test_entry_outside_band_refused(self):
        with self.assertRaises(ex.Refused) as cm:
            ex.make_plan("TEST", 111.0, self.mon, self.t, self.rng, "pct:1", "2R", daily([100.0] * 5), [], CFG)
        self.assertIn("outside the estimated price band", str(cm.exception))

    def test_or_mid_rounds_down(self):
        rng = {"high": 108.51, "low": 107.0}
        p = ex.make_plan("TEST", 109.0, self.mon, self.t, rng, "or-mid", "1R", daily([100.0] * 5), [], CFG)
        self.assertEqual(p["stop"], 107.75)                  # 107.755 -> 107.75, never up
        self.assertEqual(p["target"], 110.0)                 # 1R = 110.25, capped by the band

    def test_friday_morning_flat_by(self):
        fri = session("2026-11-06", "Friday morning")
        t = psx.ms(psx.parse_pkt("2026-11-06 10:00"))
        p = ex.make_plan("TEST", 101.0, fri, t, None, "pct:2", "1R", daily([100.0] * 5, "2026-11-05"), [], CFG)
        self.assertEqual(p["flat_by"], "11:55")
        late = psx.ms(psx.parse_pkt("2026-11-06 11:56"))
        with self.assertRaises(ex.Refused):
            ex.make_plan("TEST", 101.0, fri, late, None, "pct:2", "1R", daily([100.0] * 5, "2026-11-05"), [], CFG)

    def test_skip_when_target_does_not_cover_costs(self):
        # Resistance one rupee over the entry: the target lands at 109.99, and costs eat it.
        d = daily([100.0] * 4 + [109.0], hi=1.0)               # yesterday's high 110
        p = ex.make_plan("TEST", 109.5, self.mon, self.t, self.rng, "or-low", "2R", d, [], CFG)
        self.assertEqual(p["target"], 109.99)
        self.assertTrue(p["target_bound_by"].startswith("nearby resistance"))
        self.assertLessEqual(p["net_reward_per_share"], 0)
        self.assertEqual(p["skip"], ex.SKIP)

    def test_atr_stop(self):
        day = "2026-11-02"
        t0 = psx.ms(psx.parse_pkt(day + " 09:35"))
        bars = [{"t": t0 + i * FIVE, "o": 100, "h": 100.5, "l": 99.5, "c": 100, "v": 1, "day": day, "family": "Monday-Thursday"}
                for i in range(16)]
        entry_ms = t0 + 16 * FIVE
        p = ex.make_plan("TEST", 101.0, self.mon, entry_ms, None, "atr:2", "1R", daily([100.0] * 5), bars, CFG)
        self.assertEqual(p["stop"], 99.0)                     # 101 - 2 x 1.00
        with self.assertRaises(ex.Refused):
            ex.make_plan("TEST", 101.0, self.mon, t0 + 10 * FIVE, None, "atr:2", "1R", daily([100.0] * 5), bars, CFG)

    def test_parse_rule(self):
        self.assertEqual(ex.parse_rule("1.5R", ["r", "price:"]), ("r", 1.5))
        self.assertEqual(ex.parse_rule("price:320", ["r", "price:"]), ("price", 320.0))
        with self.assertRaises(psx.PsxError):
            ex.parse_rule("3X", ["r", "price:"])


class ExitFixtureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.tmp

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_hubc_plan_from_entry(self):
        with redirect_stdout(io.StringIO()):
            self.assertEqual(entry.main(["check", "HUBC", "--now", "2026-11-06 10:00", "--write"]), 0)
        rc, out = run(["plan", "--now", "2026-11-06 10:00", "--write"])
        self.assertEqual(rc, 0)
        with open(os.path.join(self.tmp, "plan.json"), encoding="utf-8") as f:
            p = json.load(f)
        self.assertEqual((p["entry"], p["stop"], p["target"], p["risk_per_share"]), (202.1, 200.85, 203.29, 1.25))
        self.assertEqual(p["stop_rule"], "or-mid")
        self.assertEqual(p["target_requested"], 204.6)
        self.assertTrue(p["target_bound_by"].startswith("typical daily range"))
        self.assertEqual((p["typical_range_pct"], p["resistance"]), (1.516, 203.88))
        # HUBC is ex-dividend: limits come from PSX's previous close 203.05, not the daily candle's 208.05.
        self.assertEqual(p["band"]["lower"], 182.75)
        self.assertEqual(p["band"]["upper"], 223.36)
        self.assertTrue(any("previous close is 203.05" in w for w in p["warnings"]))
        self.assertEqual(p["flat_by"], "11:55")
        self.assertAlmostEqual(p["net_reward_per_share"], 0.2567, 4)
        self.assertAlmostEqual(p["net_risk_per_share"], 2.1778, 4)
        self.assertEqual(p["net_rr"], 0.12)
        self.assertIsNone(p["skip"])
        for k in ("symbol", "side", "session_date", "entry", "stop", "target", "risk_per_share", "target_r", "stop_rule",
                  "target_rule", "flat_by", "band", "net_reward_per_share", "net_risk_per_share", "net_rr", "warnings", "created_at"):
            self.assertIn(k, p)
        self.assertIn("Flat by        11:55", out)
        rc, out = run(["show"])
        self.assertIn("Rs. 203.29", out)

    def test_plan_ahead_and_refusals(self):
        rc, out = run(["plan", "--symbol", "OGDC", "--entry", "315.01", "--stop", "pct:1", "--target", "3R",
                       "--now", "2026-11-06 11:00", "--no-entry-file"])
        self.assertEqual(rc, 1)
        self.assertIn("Skip - target does not cover costs", out)
        self.assertIn("one paisa below 315.50", out)
        rc, out = run(["plan", "--symbol", "OGDC", "--entry", "315.01", "--stop", "price:315",
                       "--now", "2026-11-06 11:00", "--no-entry-file", "--write"])
        self.assertEqual(rc, 1)
        self.assertIn("Refused: Stop is too close", out)
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "plan.json")))
        rc, out = run(["plan", "--symbol", "OGDC", "--entry", "315.01", "--stop", "atr:1",
                       "--now", "2026-11-06 10:00", "--no-entry-file"])
        self.assertIn("ATR stop needs 14", out)

    def test_needs_trigger(self):
        with redirect_stdout(io.StringIO()):
            entry.main(["check", "HUBC", "--now", "2026-11-06 09:47", "--write"])
        with self.assertRaises(psx.PsxError):
            ex.main(["plan", "--now", "2026-11-06 09:47"])


if __name__ == "__main__":
    unittest.main()
