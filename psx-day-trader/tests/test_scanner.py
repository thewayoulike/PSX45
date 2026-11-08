import io
import json
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

import _load

import psx

scan = _load.load("psx-trader-scanner", "scan")
FIVE = psx.FIVE_MS
CFG = dict(psx.DEFAULT_CONFIG)


def day_bars(day, closes, family="Monday-Thursday", first="09:35", vols=None, highs=None):
    t0 = psx.ms(psx.parse_pkt("%s %s" % (day, first)))
    out = []
    for i, c in enumerate(closes):
        if c is None:
            continue
        h = highs[i] if highs else c + 0.1
        out.append({"t": t0 + i * FIVE, "o": c, "h": h, "l": c - 0.1, "c": c, "v": (vols[i] if vols else 1000.0),
                    "day": day, "family": family})
    return out


def daily(closes, vols=None):
    t0 = psx.ms(psx.parse_pkt("2026-01-05"))
    return [{"t": t0 + i * 86400000, "o": c, "h": c + 1, "l": c - 1, "c": c, "v": (vols[i] if vols else 1000.0)}
            for i, c in enumerate(closes)]


def load_json(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def write_text(p, text):
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)


def run(argv):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        rc = scan.main(argv)
    return rc, out.getvalue()


class ScannerFixtureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.tmp

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_universe_filters(self):
        mw = psx.market_watch()
        self.assertEqual(len(scan.filter_universe(mw, 5, 100000)), 206)
        self.assertEqual(len(scan.filter_universe(mw, 5, 100000, index="KSE100")), 64)
        k30 = scan.filter_universe(mw, 5, 100000, index="KSE30")
        self.assertEqual(len(k30), 30)
        self.assertEqual(k30[0]["symbol"], "OGDC")  # most traded by value first
        rc, out = run(["universe", "--index", "KSE30", "--write", "--show", "3"])
        self.assertEqual(rc, 0)
        self.assertIn("30 with price", out)
        with open(os.path.join(self.tmp, "universe.txt"), encoding="utf-8") as f:
            lines = f.read().splitlines()
        self.assertEqual(len(lines), 30)
        self.assertTrue(lines[0].startswith("OGDC|Oil & Gas"))

    def test_daily_scan_real(self):
        d = scan.daily_scan(psx.daily_bars("OGDC"))
        self.assertEqual(d["date"], "2026-11-06")   # Friday's candle counts after the 16:30 close
        self.assertEqual(d["close"], 312.89)
        self.assertAlmostEqual(d["ma20"], 303.3275, 4)
        self.assertAlmostEqual(d["rsi"], 56.814, 3)
        self.assertAlmostEqual(d["relative_volume"], 2.5746, 4)
        self.assertEqual(d["setups"], [])
        # Before the close the day's candle is left out.
        d2 = scan.daily_scan(psx.daily_bars("HUBC"), psx.parse_pkt("2026-11-06 15:00"))
        self.assertEqual(d2["date"], "2026-11-05")
        self.assertEqual(d2["close"], 208.05)

    def test_daily_cli_writes(self):
        rc, out = run(["daily", "--symbols", "OGDC,HUBC", "--write", "--quiet"])
        self.assertEqual(rc, 1)  # nothing matched on Friday's close
        self.assertIn("Scanned 2 of 2 symbols", out)
        data = load_json(os.path.join(self.tmp, "scan.json"))
        self.assertEqual(data["mode"], "daily")
        self.assertEqual(data["as_of"], "2026-11-06 17:00 PKT")
        self.assertEqual(data["results"], [])

    def test_orb_replay(self):
        rows = psx.ticks("HUBC")
        row, why = scan.orb_row("HUBC", rows, psx.parse_pkt("2026-11-06 10:15"), CFG)
        self.assertIsNone(why)
        self.assertEqual(row["range"], {"high": 201.49, "low": 200.22})
        self.assertEqual(row["trigger"]["time"], "09:50")
        self.assertEqual(row["trigger"]["close"], 202.1)
        self.assertEqual(row["pct_over"], 0.3)
        self.assertTrue(row["in_window"])
        self.assertEqual(row["session"], "Friday morning")
        # Volume confirmation: the 09:45 candle had 0.35x the range average, so 1.5x finds none by 10:15.
        row, why = scan.orb_row("HUBC", rows, psx.parse_pkt("2026-11-06 10:15"), CFG, volume_x=1.5)
        self.assertIsNone(row)
        # Friday afternoon is its own session with its own range: no breakout there.
        row, why = scan.orb_row("HUBC", rows, psx.parse_pkt("2026-11-06 17:00"), CFG)
        self.assertIsNone(row)
        self.assertEqual(why, "no close above the range high")
        row, why = scan.orb_row("OGDC", psx.ticks("OGDC"), psx.parse_pkt("2026-11-06 09:32"), CFG)
        self.assertEqual(why, "opening range still forming (complete at 09:35)")

    def test_orb_cli_at(self):
        rc, out = run(["orb", "--symbols", "OGDC,HUBC", "--at", "11:00", "--write", "--quiet"])
        self.assertEqual(rc, 0)
        self.assertIn("as of 2026-11-06 11:00 PKT", out)
        data = load_json(os.path.join(self.tmp, "scan.json"))
        self.assertEqual(data["mode"], "orb")
        self.assertEqual([(r["symbol"], r["trigger"]["time"], r["trigger"]["close"]) for r in data["results"]],
                         [("HUBC", "09:50", 202.1), ("OGDC", "10:55", 315.01)])
        ogdc = data["results"][1]
        self.assertEqual(ogdc["name"], "Oil & Gas Development Company Limited")
        self.assertEqual(ogdc["change_pct"], round((315.1 / 316.24 - 1) * 100, 2))


class ScannerPureTests(unittest.TestCase):
    def test_breakout_and_reclaim(self):
        closes = [100.0] * 30 + [99.0, 103.0]
        d = scan.daily_scan(daily(closes, [1000.0] * 31 + [3000.0]))
        self.assertIn("20-day closing breakout", d["setups"])
        self.assertIn("Reclaimed 20-day average", d["setups"])
        self.assertAlmostEqual(d["relative_volume"], 3.0)

    def test_bull_flag(self):
        closes = [100.0] * 20 + [100 + i * 1.5 for i in range(11)] + [116, 115.5, 116.2, 115.8, 116.1]
        self.assertIn("Bull flag", scan.daily_scan(daily(closes))["setups"])

    def test_oversold(self):
        closes = [200 - i * 3 for i in range(30)]
        d = scan.daily_scan(daily(closes))
        self.assertIn("RSI below 30", d["setups"])
        d = scan.daily_scan(daily(closes + [150.0]))
        self.assertIn("Oversold bounce", d["setups"])

    def test_too_short(self):
        with self.assertRaises(psx.PsxError):
            scan.daily_scan(daily([100.0] * 10))

    def test_opening_range_trigger_and_gap(self):
        start = psx.ms(psx.parse_pkt("2026-11-02 09:32"))
        bars = day_bars("2026-11-02", [100, 100.2, 100.1, 100.3, 100.6])   # highs = close + 0.1
        r = scan.opening_range(bars, start)
        self.assertAlmostEqual(r["high"], 100.3)
        self.assertEqual(psx.hhmm(r["trigger"]["t"]), "09:55")   # 100.6 > 100.3; 100.3 is not above
        gap = day_bars("2026-11-02", [100, 100.2, 100.1, 100.2, None, 100.6])
        r = scan.opening_range(gap, start)
        self.assertIsNone(r["trigger"])
        self.assertEqual(r["gap_at"], "09:55")
        missing = day_bars("2026-11-02", [None, 100.2, 100.1, 100.3, 100.6])
        self.assertIsNone(scan.opening_range(missing, start))

    def test_entry_window(self):
        s = psx.sessions("2026-11-06")
        w = [tuple(psx.hhmm(x) for x in scan.entry_window(x, CFG)) for x in s]
        self.assertEqual(w, [("09:35", "11:20"), ("14:50", "16:25")])
        w = scan.entry_window(psx.sessions("2026-11-02")[0], CFG)
        self.assertEqual((psx.hhmm(w[0]), psx.hhmm(w[1])), ("09:50", "11:35"))

    def test_watchlist_file(self):
        tmp = tempfile.mkdtemp()
        try:
            p = os.path.join(tmp, "w.txt")
            write_text(p, "ogdc|Oil\n# note\nHUBC\n")
            self.assertEqual(scan.read_watchlist(p), ["OGDC", "HUBC"])
            p = os.path.join(tmp, "scan.json")
            write_text(p, json.dumps({"results": [{"symbol": "PPL"}, {"symbol": "OGDC"}]}))
            self.assertEqual(scan.read_watchlist(p), ["PPL", "OGDC"])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
