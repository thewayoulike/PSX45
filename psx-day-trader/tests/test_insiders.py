import contextlib
import io
import os
import shutil
import tempfile
import unittest

import _load
import psx

ins = _load.load("psx-trader-insiders", "insiders")


def run(*argv):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = ins.main(list(argv))
    return code, buf.getvalue()


class InsiderTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.dir

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_actions_normalised(self):
        self.assertEqual([ins.norm_action(a) for a in ("Buy", "BUY", "sell", "Gift-Out", "BONUS")],
                         ["Buy", "Buy", "Sell", "Other", "Other"])
        self.assertEqual(ins.person_key("Mr. Muhammad  Haroon Javed"), ins.person_key("MUHAMMAD HAROON JAVED"))

    def test_latest_has_dgkc_buy(self):
        _, out = run("--write", "latest", "--days", "3", "--action", "Buy", "--min-value", "1000000")
        data = psx.read_json(psx.path("insiders.json"))
        dgkc = [r for r in data["records"] if r["symbol"] == "DGKC" and r["date"] == "2026-11-05"]
        self.assertEqual(len(dgkc), 1)
        self.assertEqual((dgkc[0]["person"], dgkc[0]["shares"], dgkc[0]["price"], dgkc[0]["value"]),
                         ("Mikail Raza Mansha", 25000, 201.05, 5026250))
        self.assertTrue(all(r["kind"] == "Buy" and r["value"] >= 1000000 for r in data["records"]))
        self.assertTrue(all("2026-11-03" <= r["date"] <= "2026-11-06" for r in data["records"]))
        self.assertEqual(data["coverage"]["failed"], 37)
        self.assertIn("Historical coverage is partial", out)
        self.assertIn("Not inside information, not advice", out)

    def test_symbol_totals(self):
        _, out = run("--write", "symbol", "DGKC", "--days", "60")
        data = psx.read_json(psx.path("insiders.json"))
        t = data["totals"]
        self.assertEqual((t["buys"], t["shares_bought"], t["value_bought"], t["sells"], t["people"]), (2, 40000, 7921100, 0, 1))
        self.assertIn("Net (bought minus sold): Rs 7,921,100", out)

    def test_cluster(self):
        _, out = run("--write", "cluster", "--days", "30")
        clusters = {c["symbol"]: c for c in psx.read_json(psx.path("insiders.json"))["clusters"]}
        self.assertEqual(len(clusters["SHFA"]["buyers"]), 6)
        self.assertEqual(len(clusters["ENGROH"]["buyers"]), 3)
        self.assertNotIn("DGKC", clusters)              # one person buying twice is not a cluster
        self.assertTrue(all(len(c["buyers"]) >= 2 for c in clusters.values()))
        self.assertIn("not a signal", out)


if __name__ == "__main__":
    unittest.main()
