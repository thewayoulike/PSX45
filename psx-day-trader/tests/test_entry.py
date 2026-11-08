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
FIVE = psx.FIVE_MS
CFG = dict(psx.DEFAULT_CONFIG)
MON = dict(psx.sessions("2026-11-02")[0], day="2026-11-02")   # Monday: 09:32-15:30


def bars(closes, vols=None, day="2026-11-02", first="09:35"):
    t0 = psx.ms(psx.parse_pkt("%s %s" % (day, first)))
    out = []
    for i, c in enumerate(closes):
        if c is None:
            continue
        out.append({"t": t0 + i * FIVE, "o": c, "h": c + 0.1, "l": c - 0.1, "c": c,
                    "v": vols[i] if vols else 1000.0, "day": day, "family": "Monday-Thursday"})
    return out


def at(hhmm, day="2026-11-02"):
    return psx.parse_pkt("%s %s" % (day, hhmm))


class EntryPureTests(unittest.TestCase):
    def test_trigger_on_close_not_wick(self):
        b = bars([100, 100.2, 100.1, 100.3, 100.35, 100.5])    # range high 100.3 (100.2 + 0.1)
        r = entry.check_entry(b, MON, at("10:30"), CFG)
        self.assertEqual(r["status"], "triggered")
        self.assertEqual(psx.hhmm(r["trigger"]["t"]), "09:55")  # 100.35 > 100.30; 100.3 equal is not above

    def test_unfinished_candle_never_confirms(self):
        b = bars([100, 100.2, 100.1, 100.2, 101.0])            # 09:55 candle closes at 10:00
        r = entry.check_entry(b, MON, at("09:58"), CFG)
        self.assertEqual(r["status"], "waiting")
        r = entry.check_entry(b, MON, at("10:00"), CFG)
        self.assertEqual(r["status"], "triggered")

    def test_gap_means_no_setup(self):
        b = bars([100, 100.2, 100.1, 100.2, None, 101.0])
        r = entry.check_entry(b, MON, at("10:30"), CFG)
        self.assertEqual(r["status"], "no-setup")
        self.assertIn("09:55", r["reason"])

    def test_missing_opening_candle(self):
        b = bars([None, 100.2, 100.1, 100.2, 101.0])
        self.assertEqual(entry.check_entry(b, MON, at("10:30"), CFG)["status"], "no-setup")
        self.assertEqual(entry.check_entry(b, MON, at("09:45"), CFG)["status"], "waiting")

    def test_outside_window_expired(self):
        b = bars([100] * 3 + [100.1] * 30)                     # never closes above 100.1
        self.assertEqual(entry.check_entry(b, MON, at("11:35"), CFG)["status"], "expired")
        self.assertEqual(entry.check_entry(b, MON, at("11:30"), CFG)["status"], "waiting")
        late = bars([100] * 3 + [100.1] * 21 + [101.0])         # first close above: the 11:35 candle, closing 11:40
        self.assertEqual(entry.check_entry(late, MON, at("12:00"), CFG)["status"], "expired")

    def test_volume_rule(self):
        b = bars([100, 100.2, 100.1, 100.5, 100.6], vols=[1000, 1000, 1000, 1200, 2000])
        r = entry.check_entry(b, MON, at("10:30"), CFG, volume_x=1.5)
        self.assertEqual(psx.hhmm(r["trigger"]["t"]), "09:55")
        self.assertAlmostEqual(r["volume_ratio"], 2.0)

    def test_level_needs_a_cross(self):
        b = bars([101.5, 101.6, 101.4, 101.5, 100.8, 101.1])   # already above 101 when the range ends
        r = entry.check_entry(b, MON, at("10:30"), CFG, level=101.0)
        self.assertEqual(psx.hhmm(r["trigger"]["t"]), "10:00")   # 100.8 <= 101, then 101.1 > 101

    def test_parse_setup(self):
        self.assertEqual(entry.parse_setup("orb"), ("orb", None))
        self.assertEqual(entry.parse_setup("level:316.5"), ("level", 316.5))
        with self.assertRaises(psx.PsxError):
            entry.parse_setup("level:abc")


class EntryFixtureTests(unittest.TestCase):
    def setUp(self):
        self.rows = {s: psx.ticks(s) for s in ("HUBC", "OGDC")}
        self.tmp = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.tmp

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def ev(self, sym, when, **kw):
        return entry.evaluate(sym, self.rows[sym], psx.parse_pkt("2026-11-06 " + when), CFG, **kw)

    def test_hubc_friday_morning(self):
        e = self.ev("HUBC", "09:47")
        self.assertEqual(e["status"], "waiting")
        self.assertIn("Rs. 0.04 under the level Rs. 201.49", e["message"])
        e = self.ev("HUBC", "10:15")
        self.assertEqual(e["status"], "triggered")
        self.assertEqual(e["range"], {"high": 201.49, "low": 200.22, "mid": 200.855, "start": "09:20", "end": "09:35"})
        self.assertEqual((e["trigger"]["time"], e["trigger"]["close"], e["trigger"]["volume"]), ("09:50", 202.1, 40548.0))
        self.assertEqual((e["session"], e["session_end"], e["window"]), ("Friday morning", "12:00", {"from": "09:35", "to": "11:20"}))

    def test_volume_x_expires(self):
        e = self.ev("HUBC", "11:30", volume_x=1.5)
        self.assertEqual(e["status"], "expired")

    def test_afternoon_session_and_closed(self):
        e = self.ev("HUBC", "17:00")
        self.assertEqual((e["session"], e["status"]), ("Friday afternoon", "expired"))
        self.assertEqual(e["range"]["high"], 203.0)
        self.assertIn("Tue 2026-11-10 09:32 PKT", e["message"])        # Monday 9 Nov is Iqbal Day
        e = entry.evaluate("OGDC", self.rows["OGDC"], psx.parse_pkt("2026-11-07 10:00"), CFG)
        self.assertEqual(e["status"], "closed")
        self.assertIn("2026-11-06", e["message"])

    def test_level_setup(self):
        e = self.ev("OGDC", "12:30", setup="level", level=315.2)
        self.assertEqual((e["status"], e["trigger"]["time"], e["trigger"]["close"]), ("triggered", "11:05", 315.5))

    def test_cli_check_write_and_watch(self):
        out = io.StringIO()
        with redirect_stdout(out):
            rc = entry.main(["check", "HUBC", "--now", "2026-11-06 10:00", "--write"])
        self.assertEqual(rc, 0)
        with open(os.path.join(self.tmp, "entry.json"), encoding="utf-8") as f:
            data = json.load(f)
        for k in ("symbol", "setup", "status", "checked_at", "session_date", "session", "range", "trigger", "message"):
            self.assertIn(k, data)
        self.assertEqual(data["checked_at"], "2026-11-06 10:00 PKT")
        os.remove(os.path.join(self.tmp, "entry.json"))
        out = io.StringIO()
        with redirect_stdout(out):
            rc = entry.main(["watch", "OGDC", "--now", "2026-11-06 10:30", "--every", "60"])
        self.assertEqual(rc, 0)
        self.assertIn("10:55 TRIGGERED", out.getvalue())
        with open(os.path.join(self.tmp, "entry.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["trigger"]["close"], 315.01)
        out = io.StringIO()
        with redirect_stdout(out):
            rc = entry.main(["watch", "OGDC", "--now", "2026-11-07 10:00"])
        self.assertEqual(rc, 1)
        self.assertIn("CLOSED", out.getvalue())


if __name__ == "__main__":
    unittest.main()
