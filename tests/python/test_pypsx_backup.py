import datetime as dt
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lib" / "market"))

import pypsx_lib


def fake_pypsx():
    mod = types.ModuleType("pypsx")
    mod.get_corporate_actions = lambda symbol, kind=None: pd.DataFrame(
        {
            "ex_date": [pd.Timestamp("2026-09-20"), pd.Timestamp("2026-03-10"), pd.Timestamp("2025-01-05"), pd.Timestamp("2026-05-01")],
            "kind": ["dividend", "dividend", "dividend", "bonus+dividend"],
            "dividend_rs": [3.5, 2.0, 4.0, 0.0],
        }
    )
    mod.get_fundamentals = lambda symbol: pd.DataFrame(
        {
            "statement": ["income_statement"] * 5,
            "item": ["Sales", "Profit after tax", "Earnings per share", "Sales", "Profit after tax (restated)"],
            "year": [2025, 2025, 2025, 2024, 2024],
            "value": [1000000.0, 250000.0, 5.678, 900000.0, 200000.0],
        }
    )
    mod.get_companies = lambda symbol: pd.DataFrame({"symbol": ["OGDC"], "name": ["Oil & Gas Development"], "sector": ["Oil & Gas Exploration"]})
    return mod


class BackupTest(unittest.TestCase):
    def run_without_toolkit(self, fn):
        with patch.object(pypsx_lib, "_toolkit", return_value=None), patch.object(pypsx_lib, "_require_pypsx_keys", return_value=None), \
                patch.dict(sys.modules, {"pypsx": fake_pypsx()}):
            return fn("ogdc")

    def test_dividends_come_from_pypsx_when_toolkit_missing(self):
        payload = self.run_without_toolkit(pypsx_lib.get_dividend_snapshot)
        self.assertEqual(payload["source"], "pypsx")
        self.assertEqual([r["exDividendDate"] for r in payload["dividendHistory"]], ["2026-09-20", "2026-03-10", "2025-01-05"])
        self.assertEqual(payload["dividendHistory"][0]["cashAmount"], "3.5 PKR")
        self.assertEqual(payload["latestDividend"]["exDividendDate"], "2026-09-20")

    def test_company_info_uses_pypsx_fundamentals_and_profile(self):
        payload = self.run_without_toolkit(pypsx_lib.get_company_info)
        rows = payload["statements"]["annual"]["financials"]
        self.assertEqual(rows[0], {"year": "2025", "sales": "1,000,000", "totalIncome": "-", "profitAfterTax": "250,000", "eps": "5.68"})
        self.assertEqual(rows[1]["profitAfterTax"], "200,000")
        self.assertEqual(payload["fundamentals"][0]["items"][0], {"label": "Company", "value": "Oil & Gas Development"})

    def test_toolkit_error_falls_back(self):
        broken = types.SimpleNamespace(get_dividend_info=lambda s: (_ for _ in ()).throw(RuntimeError("down")))
        with patch.object(pypsx_lib, "_toolkit", return_value=broken), patch.object(pypsx_lib, "_require_pypsx_keys", return_value=None), \
                patch.dict(sys.modules, {"pypsx": fake_pypsx()}):
            self.assertEqual(pypsx_lib.get_dividend_snapshot("OGDC")["source"], "pypsx")

    def test_toolkit_data_is_used_first(self):
        toolkit = types.SimpleNamespace(
            get_dividend_info=lambda s: pd.DataFrame({"ANNUAL DIVIDEND": ["10"]}),
            get_dividend_history=lambda s: pd.DataFrame({"EX-DIVIDEND DATE": ["2026-09-20"], "CASH AMOUNT": ["5 PKR"]}),
        )
        with patch.object(pypsx_lib, "_toolkit", return_value=toolkit):
            self.assertEqual(pypsx_lib.get_dividend_snapshot("OGDC")["source"], "pypsx-toolkit")

    def test_both_failing_reports_both_reasons(self):
        with patch.object(pypsx_lib, "_toolkit", return_value=None), patch.object(
            pypsx_lib, "_require_pypsx_keys", return_value={"error": "PYPSX API keys missing"}
        ):
            payload = pypsx_lib.get_dividend_snapshot("OGDC")
        self.assertIn("pypsx-toolkit not installed", payload["error"])
        self.assertIn("PYPSX API keys missing", payload["error"])

    def test_trailing_annual_dividend(self):
        history = pypsx_lib.pypsx_dividend_rows(fake_pypsx().get_corporate_actions("OGDC"))
        self.assertEqual(pypsx_lib.trailing_annual_dividend(history, dt.date(2026, 11, 27)), "5.5 PKR")
        self.assertEqual(pypsx_lib.trailing_annual_dividend(history, dt.date(2028, 1, 1)), "-")


if __name__ == "__main__":
    unittest.main()
