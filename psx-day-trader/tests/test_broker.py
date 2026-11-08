import contextlib
import io
import json
import os
import shutil
import tempfile
import unittest

import _load
import psx

ticket = _load.load("psx-trader-broker", "ticket")


def run(*argv):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = ticket.main(list(argv))
    return code, buf.getvalue()


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.dir
        psx.write_json(psx.path("orders.json"), {"created_at": "2026-11-06 10:10 PKT", "orders": [
            {"id": "OGDC-20261106-1010", "symbol": "OGDC", "side": "buy", "type": "limit", "qty": 100, "limit": 312.5,
             "stop": 309.0, "target": 318.0, "flat_by": "16:25", "session_date": "2026-11-06",
             "est_cost": 31306.05, "max_loss_at_stop": 412.0, "profit_at_target": 436.92, "net_rr": 1.06, "warnings": []},
            {"id": "DGKC-20261106-1010", "symbol": "DGKC", "side": "buy", "type": "limit", "qty": 50, "limit": 200.5,
             "stop": 198.0, "target": 205.0, "flat_by": "16:25", "session_date": "2026-11-06"},
        ]})
        psx.write_json(psx.path("risk.json"), {"checked_at": "2026-11-06 10:12 PKT", "verdicts": [
            {"id": "OGDC-20261106-1010", "symbol": "OGDC", "verdict": "PASS", "checks": [], "reasons": []},
            {"id": "DGKC-20261106-1010", "symbol": "DGKC", "verdict": "BLOCK", "checks": [],
             "reasons": ["max trades per day reached"]},
        ]})

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def log(self):
        return psx.read_json(psx.path("state", "broker.json"))["orders"]

    def test_ready_and_not_ready(self):
        code, out = run("--now", "2026-11-06 10:15", "show")
        self.assertEqual(code, 0)
        first, second = out.split("TICKET 2 of 2")
        self.assertIn("BUY 100 shares of OGDC, LIMIT Rs. 312.50", first)
        self.assertIn("READY: psx-trader-risk PASS today", first)
        self.assertIn("Rs. 31,306.05", first)
        self.assertIn("NOT READY", second)
        self.assertIn("psx-trader-risk said BLOCK", second)
        self.assertIn("max trades per day reached", second)
        self.assertIn("1 of 2 ticket(s) READY", out)

    def test_not_ready_after_flat_by_or_stale_risk(self):
        _, out = run("--now", "2026-11-06 17:00", "show", "--index", "1")
        self.assertIn("past the flat-by time 16:25", out)
        _, out = run("--now", "2026-11-10 10:15", "show", "--index", "1")
        self.assertIn("the risk check is from 2026-11-06, not today", out)
        self.assertIn("an earlier session", out)

    def test_confirm_needs_ready_and_a_real_yes(self):
        code, out = run("--now", "2026-11-06 10:15", "confirm", "--index", "2", "--reply", "yes")
        self.assertEqual(code, 1)
        self.assertIn("NOT READY", out)
        for reply in ("sure", "yes to all", "yes DGKC", "yes 500 shares", "no"):
            code, out = run("--now", "2026-11-06 10:15", "confirm", "--index", "1", "--reply", reply)
            self.assertEqual(code, 1, reply)
            self.assertIn("Not recorded", out)
        self.assertIsNone(psx.read_json(psx.path("state", "broker.json"), required=False))
        code, out = run("--now", "2026-11-06 10:15", "confirm", "--index", "1", "--reply", "Yes, 100 OGDC at 312.50")
        self.assertEqual(code, 0, out)
        self.assertEqual([r["status"] for r in self.log()], ["ticket"])
        run("--now", "2026-11-06 10:16", "confirm", "--index", "1", "--reply", "yes")
        self.assertEqual(len(self.log()), 1)   # a second yes is not logged twice

    def test_result_append_only_and_realized_after_charges(self):
        run("--now", "2026-11-06 10:15", "confirm", "--index", "1", "--reply", "yes")
        run("--now", "2026-11-06 10:20", "result", "--index", "1", "--status", "placed")
        first = json.loads(json.dumps(self.log()))
        code, out = run("--now", "2026-11-06 15:00", "result", "--index", "1", "--status", "filled",
                        "--fill", "312.50", "--exit", "318.00")
        self.assertEqual(code, 0)
        log = self.log()
        self.assertEqual(log[:2], first)                  # earlier entries untouched
        self.assertEqual([r["status"] for r in log], ["ticket", "placed", "filled"])
        # 100 x (318.00 sold - 0.5703 charges) - 100 x (312.50 bought + 0.5605 charges)
        self.assertAlmostEqual(log[-1]["realized"], 436.92, places=2)
        self.assertIn("realized profit: Rs. 436.92", out)
        run("--now", "2026-11-06 15:05", "result", "--index", "1", "--status", "filled", "--fill", "312.50", "--exit", "309.00")
        self.assertLess(self.log()[-1]["realized"], -350)
        _, out = run("--now", "2026-11-06 16:00", "log")
        self.assertIn("OGDC", out)
        self.assertIn("Realized today:", out)
        _, out = run("--now", "2026-11-07 16:00", "log")
        self.assertIn("No ticket decisions logged on 2026-11-07", out)

    def test_cancelled_has_no_fill(self):
        with self.assertRaises(psx.PsxError):
            run("result", "--index", "1", "--status", "cancelled", "--fill", "300")
        with self.assertRaises(psx.PsxError):
            run("result", "--index", "9", "--status", "placed")


if __name__ == "__main__":
    unittest.main()
