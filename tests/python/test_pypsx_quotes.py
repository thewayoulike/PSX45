import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lib" / "market"))

import pypsx_lib


class GetQuotesTest(unittest.TestCase):
    def test_batch_returns_each_quote_without_a_shared_price_field(self):
        def fake_quote(symbol):
            return {"symbol": symbol, "price": 12.5, "last": 12.5, "price_field": "last"}

        with patch.object(pypsx_lib, "_require_pypsx_keys", return_value=None), patch.object(
            pypsx_lib, "get_quote", side_effect=fake_quote
        ):
            payload = pypsx_lib.get_quotes("OGDC,PPL")

        self.assertEqual(payload["count"], 2)
        self.assertEqual(payload["quotes"]["OGDC"]["price_field"], "last")
        self.assertNotIn("price_field", payload)


if __name__ == "__main__":
    unittest.main()
