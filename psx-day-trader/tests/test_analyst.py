import contextlib
import io
import os
import shutil
import tempfile
import unittest

import _load
import psx

facts = _load.load("psx-trader-analyst", "facts")


class AnalystTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.dir

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_parse_ogdc_page(self):
        p = facts.parse_company(psx.company_page("OGDC"))
        self.assertEqual(p["name"], "Oil & Gas Development Company Limited")
        self.assertEqual(p["fiscal_year_end"], "June")
        self.assertTrue(p["units_ok"])
        self.assertEqual(p["annual"]["periods"], ["2026", "2025", "2024", "2023"])
        self.assertEqual(p["annual"]["rows"]["Sales"][0], 449190752)
        self.assertEqual(p["annual"]["rows"]["EPS"], [56.35, 39.50, 48.59, 52.23])
        self.assertEqual(p["quarterly"]["periods"], ["Q1 2027", "Q3 2026", "Q2 2026", "Q1 2026"])
        self.assertEqual(p["quarterly"]["rows"]["Profit after Taxation"][0], 58513345)
        self.assertEqual(p["ratios"]["rows"]["EPS Growth (%)"], [42.66, -18.71, -6.97, 67.89])
        self.assertEqual(p["payouts"], [])
        self.assertEqual(p["results_announcements"][1]["url"], "https://dps.psx.com.pk/download/document/287865.pdf")

    def test_like_period_changes(self):
        ch = facts.changes(facts.parse_company(psx.company_page("OGDC")))
        key = {(c["metric"], c["kind"], c["to"], c["from"]): c for c in ch}
        eps = key[("eps", "YoY (annual)", "2026", "2025")]
        self.assertEqual(eps["change_pct"], 42.66)
        self.assertEqual(eps["change"], 16.85)
        q = key[("profit_after_tax", "YoY (same quarter)", "Q1 2027", "Q1 2026")]
        self.assertEqual(q["change_pct"], 52.76)
        self.assertIn(("sales", "QoQ", "Q3 2026", "Q2 2026"), key)
        # Q1 2027 is never compared with Q3 2026: Q4 2026 is not on the page
        self.assertNotIn(("sales", "QoQ", "Q1 2027", "Q3 2026"), key)
        self.assertFalse(any(c["kind"] == "QoQ" and c["to"] == "Q1 2027" for c in ch))

    def test_no_percent_from_non_positive_base(self):
        c = facts.change("profit_after_tax", "YoY (annual)", "2026", "2025", 100.0, -50.0)
        self.assertIsNone(c["change_pct"])
        self.assertEqual(c["change"], 150.0)
        self.assertIn("loss to a profit", c["note"])
        c = facts.change("eps", "YoY (annual)", "2026", "2025", 1.0, 0.0)
        self.assertIsNone(c["change_pct"])
        self.assertIn("zero base", c["note"])
        self.assertEqual(facts.number("(18.71)"), -18.71)
        self.assertIsNone(facts.number("-"))

    def test_cli_write(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            facts.main(["OGDC", "--write"])
        out = buf.getvalue()
        self.assertIn("EPS 2026 vs 2025: Rs. 56.35 vs Rs. 39.50 (+42.7%)", out)
        self.assertIn("not a view on the stock", out)
        r = psx.read_json(psx.path("analyst", "OGDC.json"))
        self.assertEqual(r["units"]["amounts"], "Rs in thousands (000s)")
        self.assertEqual(r["units"]["eps"], "Rs per share")
        self.assertEqual(r["sector"], "OIL & GAS EXPLORATION COMPANIES")
        self.assertTrue(r["changes"])


if __name__ == "__main__":
    unittest.main()
