import argparse
import contextlib
import io
import os
import shutil
import tempfile
import unittest

import _load
import psx

news = _load.load("psx-trader-news", "news")


def run(*argv):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = news.main(list(argv))
    return code, buf.getvalue()


class NewsTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["PSX_TRADER_DIR"] = self.dir

    def tearDown(self):
        os.environ.pop("PSX_TRADER_DIR", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_names_and_whole_words(self):
        self.assertEqual(news.core_name("Oil & Gas Development Company Limited"), "Oil & Gas Development")
        self.assertEqual(news.core_name("The Bank of Punjab"), "Bank of Punjab")
        self.assertEqual(news.core_name("D.G. Khan Cement Company Limited"), "D.G. Khan Cement")
        terms = news.name_terms("OGDC", "Oil & Gas Development Company Limited", {"news_aliases": {"OGDC": ["Ogdcl House"]}})
        self.assertIn("Oil and Gas Development", terms)
        self.assertIn("OGDCL", terms)
        self.assertIn("Ogdcl House", terms)
        self.assertNotIn("Systems", news.name_terms("SYS", "Systems Limited", {}))   # one common word is not enough
        m = news.matcher("OGDC", terms)
        self.assertEqual(m("OGDCL posts record profit"), ["OGDCL"])
        self.assertEqual(m("Oil and Gas Development Company declares dividend"), ["Oil and Gas Development"])
        self.assertEqual(m("OGDCs of the world"), [])
        pol = news.matcher("POL", news.name_terms("POL", "Pakistan Oilfields Limited", {}))
        self.assertEqual(pol("Monetary policy unchanged"), [])
        self.assertEqual(pol("POL announces discovery"), ["POL"])

    def test_catalyst_tags(self):
        self.assertIn("payout", news.tags_for("Lucky Cement announces final cash dividend"))
        self.assertIn("results", news.tags_for("OGDCL quarterly profit up 52pc"))
        self.assertIn("policy/IMF/SBP", news.tags_for("SBP holds policy rate at 11pc"))
        self.assertIn("circular debt", news.tags_for("Govt plan to clear circular debt"))
        self.assertIn("rights/bonus", news.tags_for("Board recommends right shares issue"))
        self.assertEqual(news.tags_for("Pakistan U19 beat India"), [])

    def test_tickers_from_feed(self):
        _, out = run("--tickers", "OGDC,HUBC", "--write")
        data = psx.read_json(psx.path("news.json"))
        ogdc = data["tickers"]["OGDC"]
        self.assertEqual([h["title"] for h in ogdc["headlines"]], ["OGDC faces hurdles in unlocking Baragzai oil potential: report"])
        self.assertEqual(ogdc["headlines"][0]["published"], "2026-11-06 14:37 PKT")
        self.assertEqual(ogdc["headlines"][0]["source"], "Business Recorder")
        self.assertEqual(ogdc["name"], "Oil & Gas Development Company Limited")
        self.assertEqual(data["tickers"]["HUBC"]["headlines"], [])          # HUBCO story is 3 days old
        self.assertIn("not the reason for this move", out)
        _, out = run("--tickers", "HUBC", "--hours", "96", "--write")
        hubc = psx.read_json(psx.path("news.json"))["tickers"]["HUBC"]["headlines"]
        self.assertEqual(hubc[0]["title"], "HUBCO to commence local BYD vehicle production next month: report")
        self.assertEqual(hubc[0]["matched"], ["HUBCO"])

    def test_no_future_headlines(self):
        # the feed runs to 8 November; at Friday 17:00 nothing later may show
        _, out = run("--market", "--write")
        heads = psx.read_json(psx.path("news.json"))["market"]
        self.assertTrue(all(h["published"] <= "2026-11-06 17:00 PKT" for h in heads))
        titles = [h["title"] for h in heads]
        self.assertIn("Profit-taking pulls PSX down around 1,500 points", titles)
        self.assertIn("IMF urges Pakistan to widen tax base, accelerate reforms", titles)
        self.assertFalse(any(t.startswith("Indian rupee") for t in titles))

    def test_announcements(self):
        anns = news.announcements(psx.company_page("OGDC"))
        self.assertEqual(len(anns), 15)
        self.assertEqual(anns[0]["date"], "2026-11-06")
        res = [a for a in anns if a["tab"] == "Financial Results"]
        self.assertEqual(res[0]["title"], "Transmission of Quarterly Report for the Period Ended September 30, 2026")
        self.assertEqual(res[1]["url"], "https://dps.psx.com.pk/download/document/287865.pdf")
        self.assertTrue(any(a["revoked"] for a in anns))
        _, out = run("--tickers", "OGDC", "--announcements")
        self.assertIn("CREDIT OF FINAL CASH DIVIDEND", out)

    def test_needs_symbols(self):
        with self.assertRaises(psx.PsxError):
            run()
        psx.write_json(psx.path("plan.json"), {"symbol": "DGKC"})
        self.assertEqual(news.default_symbols(), ["DGKC"])


if __name__ == "__main__":
    unittest.main()
