import contextlib
import io
import os
import shutil
import tempfile
import unittest

import _load
import psx

alerts = _load.load("psx-trader-alerts", "alerts")


def run(*argv):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = alerts.main(list(argv))
    return code, buf.getvalue()


def rings(out):
    return [l[6:] for l in out.splitlines() if l.startswith("RING: ")]


class AlertTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.dir

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_clock_friday(self):
        _, out = run("clock")
        self.assertIn("2026-11-06 17:00 PKT (Friday)", out)
        self.assertIn("PSX is CLOSED now.", out)
        self.assertIn("09:17-12:00 (Friday morning), 14:32-16:30 (Friday afternoon)", out)
        self.assertIn("Friday break: no continuous trading from 12:00 to 14:32", out)
        self.assertIn("Next open: Tue 2026-11-10 09:32 PKT", out)   # Monday 9 November is Iqbal Day
        _, out = run("--now", "2026-11-06 13:00", "clock")
        self.assertIn("It is the Friday break. Trading resumes at 14:32.", out)
        _, out = run("--now", "2026-11-06 10:00", "clock")
        self.assertIn("PSX is OPEN: Friday morning session, continuous trading until 12:00.", out)

    def test_quote_write(self):
        _, out = run("quote", "OGDC,DGKC", "NOPE", "--write")
        prices = psx.read_json(psx.path("prices.json"))
        self.assertEqual(prices["OGDC"]["price"], 312.89)
        self.assertEqual(prices["OGDC"]["ldcp"], 316.24)
        self.assertEqual(prices["OGDC"]["change_pct"], -1.06)
        self.assertEqual(prices["DGKC"]["volume"], 3527237.0)
        self.assertEqual(prices["OGDC"]["time"], "2026-11-06 17:00 PKT")
        self.assertIn("NOPE is not on PSX Market Watch", out)
        self.assertIn("last traded prices of the latest session", out)

    def test_quote_holdings(self):
        psx.write_json(psx.path("portfolio.json"), {"cash": 1, "positions": [{"symbol": "LUCK", "qty": 1, "avg_price": 1}]})
        psx.write_json(psx.path("plan.json"), {"symbol": "OGDC"})
        self.assertEqual(alerts.holdings(), ["LUCK", "OGDC"])
        run("quote", "--holdings", "--write")
        self.assertEqual(sorted(psx.read_json(psx.path("prices.json"))), ["LUCK", "OGDC"])

    def test_price_alerts_ring_once(self):
        run("add", "OGDC", "--below", "315")
        run("add", "OGDC", "--above", "320")
        run("add", "DGKC", "--above", "200")
        _, out = run("check", "--no-time")
        self.assertEqual(len(rings(out)), 2)
        self.assertTrue(any("OGDC at or below 315.00 (last traded 312.89)" in r for r in rings(out)))
        self.assertTrue(any(r.startswith("DGKC") for r in rings(out)))
        _, out = run("check", "--no-time")
        self.assertEqual(rings(out), [])
        self.assertIn("1 alert(s) still waiting", out)
        _, out = run("list")
        self.assertIn("ogdc-above-320", out)
        run("remove", "--rang")
        self.assertEqual([a["id"] for a in psx.read_json(psx.path("alerts.json"))["alerts"]], ["ogdc-above-320"])

    def test_from_plan(self):
        psx.write_json(psx.path("plan.json"), {"symbol": "OGDC", "session_date": "2026-11-06", "entry": 312.5,
                                               "stop": 313.0, "target": 318.0, "flat_by": "16:25"})
        run("add", "--from-plan")
        ids = [a["id"] for a in psx.read_json(psx.path("alerts.json"))["alerts"]]
        self.assertEqual(ids, ["ogdc-plan-stop", "ogdc-plan-target", "ogdc-plan-flat"])
        _, out = run("--now", "2026-11-06 16:00", "check", "--no-time")
        self.assertEqual(len(rings(out)), 1)                 # stop 313.00 hit at 312.89; flat-by not yet
        _, out = run("--now", "2026-11-06 16:26", "check", "--no-time")
        self.assertEqual(rings(out), ["Flat-by 16:25: sell any OGDC still open"])
        _, out = run("--now", "2026-11-06 16:40", "check", "--no-time")
        self.assertEqual(rings(out), [])
        # a plan for another day never rings today
        psx.write_json(psx.path("plan.json"), {"symbol": "DGKC", "session_date": "2026-11-10", "stop": 250.0})
        run("add", "--from-plan")
        _, out = run("--now", "2026-11-06 16:45", "check", "--no-time")
        self.assertEqual(rings(out), [])

    def test_friday_time_alerts_once_each(self):
        seen = []
        for t in ("09:18", "09:30", "11:56", "12:01", "14:33", "16:26", "16:31", "16:50"):
            _, out = run("--now", "2026-11-06 " + t, "check")
            seen.append((t, rings(out)))
        got = dict(seen)
        self.assertEqual(len(got["09:18"]), 1)
        self.assertIn("Friday morning session is open", got["09:18"][0])
        self.assertEqual(got["09:30"], [])
        self.assertIn("Flat-by: 11:55", got["11:56"][0])
        self.assertIn("Friday break: no trading until 14:32", got["12:01"][0])
        self.assertIn("Friday afternoon session is open", got["14:33"][0])
        self.assertIn("Flat-by: 16:25", got["16:26"][0])
        self.assertIn("closed for today (16:30)", got["16:31"][0])
        self.assertEqual(got["16:50"], [])
        self.assertEqual(sum(len(r) for _, r in seen), 6)

    def test_late_check_skips_old_reminders(self):
        _, out = run("--now", "2026-11-06 17:00", "check")
        self.assertEqual(rings(out), [])
        _, out = run("--now", "2026-11-07 10:00", "check")   # Saturday
        self.assertEqual(rings(out), [])


if __name__ == "__main__":
    unittest.main()
