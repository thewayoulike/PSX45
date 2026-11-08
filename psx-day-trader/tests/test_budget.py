import json
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO

import _load
import psx

sz = _load.load("psx-trader-budget", "size")

BAND = psx.price_band(316.24)   # OGDC's prior close on 2026-11-06: 284.62 - 347.86


def plan(**kw):
    p = {"symbol": "OGDC", "side": "buy", "session_date": "2026-11-06", "entry": 313.0, "stop": 305.0,
         "target": 330.0, "flat_by": "11:55", "band": BAND}
    p.update(kw)
    return p


def cfg(**kw):
    c = dict(psx.DEFAULT_CONFIG, max_position_pct=50)
    c.update(kw)
    return c


class BudgetTests(unittest.TestCase):
    def test_risk_budget_binds(self):
        o = sz.size_plan(plan(), cfg())["order"]
        self.assertEqual(o["qty"], 530)
        self.assertEqual(o["binding"], "risk budget")
        self.assertEqual(o["est_cost"], 166270.63)
        self.assertEqual(o["max_loss_at_stop"], 4991.31)
        self.assertEqual(o["profit_at_target"], 8228.52)
        self.assertEqual(o["profit_after_cgt"], 6994.25)
        self.assertEqual(o["net_rr"], 1.65)
        self.assertEqual(o["id"], "OGDC-20261106-1700")
        self.assertEqual((o["type"], o["limit"], o["stop"], o["target"]), ("limit", 313.0, 305.0, 330.0))
        self.assertEqual(o["gap_loss_at_lower_limit"], 15768.12)
        self.assertTrue(any("over twice your" in w for w in o["warnings"]))
        self.assertFalse(o["skip"])

    def test_position_cap_binds(self):
        o = sz.size_plan(plan(), cfg(max_position_pct=25))["order"]
        self.assertEqual((o["qty"], o["binding"]), (398, "position cap"))

    def test_cash_buffer_binds(self):
        o = sz.size_plan(plan(), cfg(cash_buffer_pct=80), max_loss=100000)["order"]
        self.assertEqual((o["qty"], o["binding"]), (318, "cash buffer"))

    def test_maximum_order_binds(self):
        o = sz.size_plan(plan(), cfg(max_order=20000))["order"]
        self.assertEqual((o["qty"], o["binding"]), (63, "maximum order"))

    def test_capital_override(self):
        o = sz.size_plan(plan(), cfg(), capital=50000)["order"]
        self.assertEqual((o["qty"], o["binding"]), (79, "position cap"))

    def test_portfolio_cash(self):
        pf = {"cash": 100000, "positions": [{"symbol": "HUBC", "qty": 500, "avg_price": 200}]}
        res = sz.size_plan(plan(), cfg(), portfolio=pf)
        self.assertEqual(res["limits"]["capital"], 200000.0)
        self.assertEqual(res["limits"]["caps"], {"position cap": 100000.0, "cash buffer": 80000.0})
        self.assertEqual((res["order"]["qty"], res["order"]["binding"]), (255, "cash buffer"))

    def test_lot_rounding(self):
        o = sz.size_plan(plan(), cfg(lot_size=100))["order"]
        self.assertEqual(o["qty"], 500)          # 530 by risk, floored to whole lots of 100
        res = sz.size_plan(plan(), cfg(lot_size=1000))
        self.assertNotIn("order", res)
        self.assertIn("cannot fund one lot of 1000", res["errors"][0])

    def test_skip_when_target_does_not_cover_costs(self):
        o = sz.size_plan(plan(stop=310.0, target=313.5), cfg())["order"]
        self.assertTrue(o["skip"])
        self.assertTrue(o["warnings"][0].startswith(sz.TARGET_COST_SKIP))

    def test_low_reward_risk_and_near_limit(self):
        o = sz.size_plan(plan(entry=347.85, stop=340.0, target=360.0), cfg())["order"]
        self.assertTrue(any("below your minimum 1.50" in w for w in o["warnings"]))
        self.assertTrue(any("upper limit" in w for w in o["warnings"]))
        o = sz.size_plan(plan(entry=290.0, stop=284.63, target=300.0), cfg())["order"]
        self.assertTrue(any("lower limit Rs. 284.62: if the stock locks" in w for w in o["warnings"]))

    def test_errors(self):
        self.assertIn("Stop is too close", sz.size_plan(plan(stop=312.5), cfg())["errors"][0])
        self.assertIn("stop < entry < target", sz.size_plan(plan(stop=320), cfg())["errors"][0])
        self.assertIn("Long only", sz.size_plan(plan(side="sell"), cfg())["errors"][0])

    def test_band_from_prices_json(self):
        p = plan()
        del p["band"]
        self.assertEqual(sz.band_for(p, {"prices": {"OGDC": {"ldcp": 316.24}}})["lower"], 284.62)
        self.assertIsNone(sz.band_for(p, None))
        o = sz.size_plan(p, cfg())["order"]
        self.assertTrue(any("Price band unknown" in w for w in o["warnings"]))

    def test_rebalance(self):
        quotes = {"OGDC": {"current": 312.89}, "HUBC": {"current": 201.61}}
        pf = {"cash": 400000, "positions": [{"symbol": "HUBC", "qty": 1000, "avg_price": 190}]}
        res = sz.rebalance({"OGDC": 50, "HUBC": 50}, cfg(), pf, quotes)
        self.assertEqual(res["total"], 601610.0)
        o = {x["symbol"]: x for x in res["orders"]}
        self.assertEqual(o["OGDC"]["qty"], 863)          # 270,724.50 target / 313.61 a share with charges
        self.assertEqual(o["HUBC"]["qty"], 342)          # tops up 201,610 held to 270,724.50
        self.assertEqual(o["OGDC"]["kind"], "rebalance")
        res = sz.rebalance({"HUBC": 1}, cfg(max_position_pct=10), pf, quotes)
        self.assertEqual(res["orders"], [])
        self.assertIn("only buys", res["notes"][0])


class BudgetCliTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.dir
        psx.write_json(os.path.join(self.dir, "plan.json"), plan())
        psx.write_json(os.path.join(self.dir, "config.json"), {"max_position_pct": 50})

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_write(self):
        out = StringIO()
        with redirect_stdout(out):
            self.assertEqual(sz.main(["--write"]), 0)
        self.assertIn("decides it", out.getvalue())
        with open(os.path.join(self.dir, "orders.json"), encoding="utf-8") as f:
            doc = json.load(f)
        self.assertEqual(doc["orders"][0]["qty"], 530)
        with redirect_stdout(StringIO()):
            self.assertEqual(sz.main(["--max-loss", "1"]), 1)


if __name__ == "__main__":
    unittest.main()
