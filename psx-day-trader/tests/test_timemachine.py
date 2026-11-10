import datetime as dt
import os
import random
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO

import _load
import psx

tm = _load.load("psx-trader-timemachine", "timemachine")


def make_history(root, symbol="OGDC", start="2026-08-03", end="2026-11-05", seed=5, drift=0.0, limit=None):
    """Write synthetic recorded sessions (every PSX session between start and end) like record_session does."""
    rng = random.Random(seed)
    day = dt.date.fromisoformat(start)
    price = 300.0
    days = 0
    while day <= dt.date.fromisoformat(end):
        d = day.isoformat()
        rows = []
        for s in psx.sessions(d):
            t = -(-s["start"] // psx.FIVE_MS) * psx.FIVE_MS
            while t + psx.FIVE_MS <= s["end"]:
                o = price
                c = round(o * (1 + rng.gauss(drift, 0.003)), 2)
                h = round(max(o, c) * (1 + abs(rng.gauss(0, 0.0015))), 2)
                l = round(min(o, c) * (1 - abs(rng.gauss(0, 0.0015))), 2)
                rows.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": 1000.0, "family": s["family"], "day": d})
                price = c
                t += psx.FIVE_MS
        if rows:
            psx.write_json(os.path.join(root, "bars", symbol, d + ".json"), {"symbol": symbol, "day": d, "bars": rows})
            days += 1
            if limit and days >= limit:
                break
        day += dt.timedelta(days=1)
    return days


class Args:
    def __init__(self, **kw):
        self.plan = None
        self.symbol = self.entry_time = self.flat_by = self.date = None
        self.__dict__.update(kw)


class TimeMachineTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.dir
        self.cfg = psx.load_config()

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def plan(self, **kw):
        p = {"symbol": "OGDC", "side": "buy", "session_date": "2026-11-06", "entry": 313.0, "stop": 311.5,
             "target": 316.0, "target_r": 2, "stop_rule": "or-low", "flat_by": "11:55",
             "band": {"lower": 284.62, "upper": 347.86, "basis": "test"}}
        p.update(kw)
        psx.write_json(os.path.join(self.dir, "plan.json"), p)
        return tm.load_plan(Args(plan=os.path.join(self.dir, "plan.json")), self.cfg)

    def test_refuses_without_history(self):
        make_history(self.dir, start="2026-10-29", end="2026-11-05")   # one Friday only
        with self.assertRaises(psx.PsxError) as e:
            tm.time_machine(self.plan(), self.cfg, paths=200)
        msg = str(e.exception)
        self.assertIn("at least 3 complete earlier Friday morning sessions and found 1", msg)
        self.assertIn("record OGDC", msg)

    def test_deterministic_friday_morning(self):
        make_history(self.dir)
        doc = tm.time_machine(self.plan(), self.cfg, paths=2000, seed=19)
        again = tm.time_machine(self.plan(), self.cfg, paths=2000, seed=19)
        self.assertEqual(doc["mc"], again["mc"])
        m = doc["mc"]
        self.assertEqual(m["family"], "Friday morning")
        self.assertEqual(m["pool_sessions"], 12)       # Fridays 2026-08-07 .. 2026-10-30, not 14 Aug (holiday)
        self.assertEqual((m["entry_at"], m["flat_by"], m["candles"]), ("09:35", "11:55", 28))
        self.assertAlmostEqual(m["p_target"] + m["p_stop"] + m["p_open_at_flat_by"] + m["p_locked"], 1.0, places=3)
        self.assertEqual(m["counts"], {"target": 1103, "stop": 895, "close": 2, "locked": 0})
        self.assertTrue(doc["verdict"].startswith("Leans toward the stop: after charges a win pays 0.53 times a loss"))
        self.assertEqual(m["rupees_basis"], "per share")
        self.assertTrue(any("upstream wants 20" in w for w in doc["warnings"]))
        other = tm.time_machine(self.plan(), self.cfg, paths=2000, seed=7)
        self.assertNotEqual(other["mc"]["counts"], m["counts"])

    def test_family_separation(self):
        make_history(self.dir)
        thu = self.plan(session_date="2026-11-05", entry_time="10:15", flat_by="15:25")
        doc = tm.time_machine(thu, self.cfg, paths=100, use_latest=False)
        self.assertEqual(doc["mc"]["family"], "Monday-Thursday")
        self.assertEqual(doc["mc"]["pool_sessions"], 55)
        aft = self.plan(entry_time="14:50", flat_by="16:25")
        doc = tm.time_machine(aft, self.cfg, paths=100)
        self.assertEqual(doc["mc"]["family"], "Friday afternoon")
        self.assertEqual(doc["mc"]["pool_sessions"], 12)
        self.assertEqual(doc["mc"]["pool_to"], "2026-10-30")   # the plan's own day is never in the pool

    def test_qty_from_orders(self):
        make_history(self.dir)
        psx.write_json(os.path.join(self.dir, "orders.json"), {"orders": [{"symbol": "OGDC", "qty": 100}]})
        doc = tm.time_machine(self.plan(), self.cfg, paths=500)
        self.assertEqual(doc["mc"]["rupees_basis"], "100 shares")
        self.assertLessEqual(doc["mc"]["p10"], doc["mc"]["p50"])
        self.assertLessEqual(doc["mc"]["p50"], doc["mc"]["p90"])

    def test_history_runs(self):
        make_history(self.dir)
        doc = tm.time_machine(self.plan(), self.cfg, paths=100)
        h = doc["history"]
        self.assertGreater(h["sessions"], 60)
        self.assertEqual(h["fired"], h["target"] + h["stop"] + h["neither"] + h["locked"])
        self.assertEqual(h["rule"]["stop_rule"], "or-low")

    def test_daily_view(self):
        doc = tm.daily_machine(self.plan(), self.cfg, paths=500, seed=19, days=5)
        self.assertEqual(doc["mode"], "daily (swing-trade view)")
        again = tm.daily_machine(self.plan(), self.cfg, paths=500, seed=19, days=5)
        self.assertEqual(doc["mc"], again["mc"])
        self.assertEqual(doc["mc"]["daily_candles"], 250)


class TimeMachineCliTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.dir

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_record_then_run(self):
        out = StringIO()
        with redirect_stdout(out):
            self.assertEqual(tm.main(["record", "OGDC"]), 0)
        self.assertIn("Friday afternoon 1, Friday morning 1", out.getvalue())
        self.assertTrue(os.path.exists(os.path.join(self.dir, "bars", "OGDC", "2026-11-06.json")))
        make_history(self.dir, end="2026-11-05")
        psx.write_json(os.path.join(self.dir, "plan.json"),
                       {"symbol": "OGDC", "side": "buy", "session_date": "2026-11-06", "entry": 313.0, "stop": 311.5,
                        "target": 316.0, "stop_rule": "or-low", "flat_by": "11:55", "entry_time": "10:15",
                        "band": {"lower": 284.62, "upper": 347.86}})
        out = StringIO()
        with redirect_stdout(out):
            self.assertEqual(tm.main(["run", "--paths", "300", "--write"]), 0)
        text = out.getvalue()
        self.assertIn("from 10:15 to flat-by 11:55", text)
        doc = psx.read_json(os.path.join(self.dir, "timemachine.json"))
        self.assertEqual(doc["mc"]["paths"], 300)
        self.assertEqual(doc["mc"]["candles"], 20)


def bar(o, h, l, c):
    return {"o": o, "h": h, "l": l, "c": c}


class WalkTests(unittest.TestCase):
    def test_stop_first_on_ambiguous_candle(self):
        self.assertEqual(tm.walk([bar(100, 106, 94, 100)], 95, 105), ("stop", 95))

    def test_gap_stop_at_worse_open(self):
        self.assertEqual(tm.walk([bar(100, 101, 99, 100), bar(93, 94, 92, 93)], 95, 105), ("stop", 93))

    def test_target(self):
        self.assertEqual(tm.walk([bar(100, 105.5, 99, 105)], 95, 105), ("target", 105))

    def test_locked_lower_limit_cannot_fill(self):
        band = {"lower": 90.0, "upper": 110.0}
        bars = [bar(90, 90, 90, 90), bar(90, 90, 90, 90)]
        self.assertEqual(tm.walk(bars, 95, 105, band), ("locked", 90))
        bars.append(bar(91, 92, 90.5, 92))      # unlocks: the stop fills at the open
        self.assertEqual(tm.walk(bars, 95, 105, band), ("stop", 91))

    def test_close_at_flat_by(self):
        self.assertEqual(tm.walk([bar(100, 101, 99, 100.5)], 95, 105), ("close", 100.5))

    def test_simulate_locked_path(self):
        # every sampled candle drops 20%: clamped to the lower limit and locked, so the stop never fills
        pool = [[], [(0.8, 0.8, 0.8, 0.8)], [(0.8, 0.8, 0.8, 0.8)]]
        cfg = dict(psx.DEFAULT_CONFIG)
        mc = tm.simulate(pool, 3, 0, 2, 100.0, 98.0, 104.0, cfg, {"lower": 90.0, "upper": 110.0}, paths=10, jitter=0)
        self.assertEqual(mc["counts"]["locked"], 10)
        mc = tm.simulate(pool, 3, 0, 2, 100.0, 98.0, 104.0, cfg, None, paths=10, jitter=0)
        self.assertEqual(mc["counts"]["stop"], 10)   # without a band: gap stop at the open
        self.assertLess(mc["avg_net_r"], -9)

    def test_verdict(self):
        self.assertTrue(tm.verdict({"p_target": 0.30, "p_stop": 0.31, "r_at_target": 1}).startswith("Close to a coin flip"))
        self.assertTrue(tm.verdict({"p_target": 0.20, "p_stop": 0.60, "r_at_target": 2}).startswith("Leans toward the stop"))


if __name__ == "__main__":
    unittest.main()


class RecordAllTests(unittest.TestCase):
    def test_record_all_saves_every_traded_symbol(self):
        import io, tempfile
        from contextlib import redirect_stdout, redirect_stderr
        tm = _load.load("psx-trader-timemachine", "timemachine")
        rows = [{"symbol": "HUBC", "volume": 2191687, "listed_in": "KSE100"},
                {"symbol": "OGDC", "volume": 4692324, "listed_in": "KSE100"},
                {"symbol": "ZZZQ", "volume": 0, "listed_in": ""},          # did not trade: skipped
                {"symbol": "NOFIX", "volume": 50, "listed_in": ""}]        # no saved data offline: reported
        tmp = tempfile.mkdtemp()
        old_mw, old_dir = tm.psx.market_watch, os.environ.get("PSX_TRADER_DIR")
        tm.psx.market_watch = lambda cfg=None: rows
        os.environ["PSX_TRADER_DIR"] = tmp
        try:
            out, err = io.StringIO(), io.StringIO()
            with redirect_stdout(out), redirect_stderr(err):
                self.assertEqual(tm.main(["record", "--all"]), 0)
            text = out.getvalue()
            self.assertIn("Saved the latest session for 2 of 3 symbols", text)
            self.assertIn("record NOFIX", text)
            self.assertTrue(os.path.exists(os.path.join(tmp, "bars", "OGDC", "2026-11-06.json")))
            self.assertTrue(os.path.exists(os.path.join(tmp, "bars", "HUBC", "2026-11-06.json")))
            self.assertIn("[1/3] OGDC", err.getvalue())                       # most traded first
            with redirect_stdout(io.StringIO()) as o2, redirect_stderr(io.StringIO()):
                tm.main(["record", "--all", "--index", "KSE100", "--min-volume", "3000000"])
            self.assertIn("for 1 of 1 symbols", o2.getvalue())
        finally:
            tm.psx.market_watch = old_mw
            if old_dir is None:
                os.environ.pop("PSX_TRADER_DIR", None)
            else:
                os.environ["PSX_TRADER_DIR"] = old_dir
