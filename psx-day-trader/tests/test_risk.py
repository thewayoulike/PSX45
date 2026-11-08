import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO

import _load
import psx

ck = _load.load("psx-trader-risk", "check")

AT_1020 = psx.parse_pkt("2026-11-06 10:20")       # Friday morning session, inside the entry window


def order(**kw):
    o = {"id": "OGDC-20261106-1015", "symbol": "OGDC", "side": "buy", "type": "limit", "qty": 530,
         "limit": 313.0, "stop": 305.0, "target": 330.0, "flat_by": "11:55", "session_date": "2026-11-06",
         "est_cost": 166270.63, "max_loss_at_stop": 4991.31, "warnings": []}
    o.update(kw)
    return o


def cfg(**kw):
    c = dict(psx.DEFAULT_CONFIG, max_position_pct=50)
    c.update(kw)
    return c


PRICES = {"prices": {"OGDC": {"ldcp": 316.24, "current": 312.89}}}


def run(orders, c=None, now=AT_1020, **kw):
    kw.setdefault("prices", PRICES)
    return ck.check_orders(orders, c or cfg(), now=now, **kw)["verdicts"]


def failed(v):
    return [c["name"] for c in v["checks"] if not c["ok"]]


class RiskTests(unittest.TestCase):
    def test_all_pass(self):
        v = run([order()])[0]
        self.assertEqual(v["verdict"], "PASS", v["reasons"])
        self.assertEqual(len(v["checks"]), 15)
        self.assertEqual(v["max_loss"], 4991.31)

    def test_max_loss_per_trade(self):
        v = run([order(qty=531)])[0]
        self.assertEqual((v["verdict"], failed(v)), ("BLOCK", ["max loss per trade"]))

    def test_daily_loss_includes_today(self):
        broker = {"orders": [{"id": "HUBC-1", "status": "filled", "symbol": "HUBC", "qty": 100, "limit": 200,
                              "stop": 195, "at": "2026-11-06 09:40", "exit_price": 190, "realized": -11000}]}
        v = run([order()], broker=broker)[0]
        self.assertEqual(failed(v), ["daily loss limit"])
        self.assertIn("losses taken today Rs. 11,000.00", v["reasons"][0])
        old = {"orders": [dict(broker["orders"][0], at="2026-11-05 10:00")]}
        self.assertEqual(run([order()], broker=old)[0]["verdict"], "PASS")

    def test_open_risk_counts(self):
        broker = {"orders": [{"id": "HUBC-1", "status": "filled", "symbol": "HUBC", "qty": 2000, "limit": 200,
                              "stop": 195, "at": "2026-11-06 09:40"}]}
        v = run([order()], broker=broker, portfolio={"cash": 1000000, "positions": []})[0]
        self.assertEqual(failed(v), ["daily loss limit"])
        self.assertIn("open risk Rs. 11,", v["reasons"][0])
        self.assertIn("cash after buffer", failed(run([order()], broker=broker)[0]))   # open orders use the cash

    def test_trades_per_day(self):
        broker = {"orders": [{"id": "X%d" % i, "status": "filled", "symbol": "S%d" % i, "qty": 1, "limit": 10,
                              "at": "2026-11-06 09:4%d" % i, "exit_price": 10, "realized": 0} for i in range(3)]}
        v = run([order()], broker=broker)[0]
        self.assertEqual(failed(v), ["trades per day"])

    def test_batch_counts_together(self):
        a = order()
        b = order(id="HUBC-1", symbol="HUBC", qty=100, limit=200.0, stop=190.0, target=220.0)
        c = order(id="LUCK-1", symbol="LUCK", qty=100, limit=200.0, stop=190.0, target=220.0)
        d = order(id="PPL-1", symbol="PPL", qty=100, limit=200.0, stop=190.0, target=220.0)
        vs = run([a, b, c, d], c=cfg(max_position_pct=100))
        self.assertEqual([v["verdict"] for v in vs], ["PASS", "PASS", "PASS", "BLOCK"])
        self.assertEqual(failed(vs[3]), ["trades per day"])

    def test_reward_risk(self):
        v = run([order(target=320.0)])[0]
        self.assertEqual(failed(v), ["reward/risk"])

    def test_skip_target(self):
        v = run([order(stop=310.0, target=313.5, qty=100)])[0]
        self.assertEqual(failed(v), ["reward/risk", "target covers costs"])
        v = run([order(skip=True)])[0]
        self.assertEqual(failed(v), ["target covers costs"])

    def test_entry_window_and_market(self):
        v = run([order()], now=psx.parse_pkt("2026-11-06 09:25"))[0]
        self.assertEqual(failed(v), ["entry window"])
        v = run([order()], now=psx.parse_pkt("2026-11-06 11:30"))[0]
        self.assertEqual(failed(v), ["entry window"])
        v = run([order()], now=psx.parse_pkt("2026-11-06 13:00"))[0]
        self.assertEqual(failed(v), ["market open", "entry window", "flat-by"])

    def test_holiday_and_other_day(self):
        v = run([order(session_date="2026-11-09")], now=psx.parse_pkt("2026-11-09 10:20"))[0]
        self.assertIn("trading day", failed(v))
        v = run([order(session_date="2026-11-05")])[0]
        self.assertEqual(failed(v), ["session date"])

    def test_flat_by(self):
        v = run([order(flat_by="15:25")])[0]       # Friday morning ends 12:00; the afternoon is a new session
        self.assertEqual(failed(v), ["flat-by"])
        self.assertIn("after this session ends at 12:00", v["reasons"][0])
        v = run([order(flat_by=None)])[0]
        self.assertEqual(failed(v), ["flat-by"])

    def test_position_and_cash(self):
        v = run([order()], c=cfg(max_position_pct=25))[0]
        self.assertEqual(failed(v), ["position size"])
        pf = {"cash": 150000, "positions": []}
        v = run([order()], portfolio=pf)[0]
        self.assertEqual(failed(v), ["position size", "cash after buffer"])

    def test_price_band(self):
        v = run([order(limit=350.0, stop=345.0, target=370.0, qty=100)], c=cfg(min_reward_risk=1))[0]
        self.assertEqual(failed(v), ["price band"])
        self.assertTrue(any("above the upper limit" in w for w in v["warnings"]))
        v = run([order()], prices=None)[0]
        self.assertEqual(v["verdict"], "PASS")
        self.assertTrue(any("price band unknown" in w for w in v["warnings"]))
        v = ck.check_orders([order(limit=350.0, stop=345.0, target=370.0, qty=100)], cfg(min_reward_risk=1),
                            now=AT_1020, prior={"OGDC": 316.24})["verdicts"][0]
        self.assertEqual(failed(v), ["price band"])

    def test_duplicates(self):
        pf = {"cash": 500000, "positions": [{"symbol": "OGDC", "qty": 10, "avg_price": 300}]}
        self.assertEqual(failed(run([order()], portfolio=pf)[0]), ["duplicate"])
        broker = {"orders": [{"id": "OGDC-old", "status": "ticket", "symbol": "OGDC", "qty": 1, "limit": 310, "at": "2026-11-06 09:50"}]}
        self.assertEqual(failed(run([order()], broker=broker)[0]), ["duplicate"])
        cancelled = {"orders": [dict(broker["orders"][0], status="cancelled")]}
        self.assertEqual(run([order()], broker=cancelled)[0]["verdict"], "PASS")

    def test_long_only_and_lots(self):
        self.assertIn("order shape", failed(run([order(side="sell")])[0]))
        self.assertEqual(failed(run([order(qty=530)], c=cfg(lot_size=100))[0]), ["order shape"])


class RiskCliTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.dir
        psx.write_json(os.path.join(self.dir, "config.json"), {"max_position_pct": 50})
        psx.write_json(os.path.join(self.dir, "orders.json"), {"orders": [order()]})

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_exit_codes_and_write(self):
        with redirect_stdout(StringIO()):
            self.assertEqual(ck.main(["--now", "2026-11-06 10:20", "--prior-close", "OGDC=316.24", "--write"]), 0)
            self.assertEqual(ck.main([]), 1)          # PSX_NOW 17:00: market closed
            self.assertEqual(ck.main(["--now", "2026-11-06 10:20", "--quotes"]), 0)
        doc = psx.read_json(os.path.join(self.dir, "risk.json"))
        self.assertEqual(doc["verdicts"][0]["verdict"], "PASS")


if __name__ == "__main__":
    unittest.main()
