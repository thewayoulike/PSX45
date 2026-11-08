import os
import unittest

from _load import FIX  # noqa: F401  (sets offline mode)
import psx


class CommonTests(unittest.TestCase):
    def test_daily_and_ticks(self):
        d = psx.daily_bars("OGDC")
        self.assertGreater(len(d), 2000)
        self.assertEqual(psx.pkt_day(d[-1]["t"]), "2026-11-06")
        bars = psx.ticks_to_bars(psx.ticks("OGDC"))
        segs = psx.segments(bars)
        self.assertEqual([(s["family"], len(s["bars"]), s["complete"]) for s in segs],
                         [("Friday morning", 32, True), ("Friday afternoon", 23, True)])

    def test_market_watch(self):
        mw = {r["symbol"]: r for r in psx.market_watch()}
        self.assertGreaterEqual(len(mw), 400)
        self.assertEqual(mw["OGDC"]["current"], 312.89)
        # Badges like XD sit inside the symbol cell; they must not change the symbol.
        self.assertEqual(mw["HUBC"]["current"], 201.61)
        self.assertEqual(mw["HUBC"]["flags"], ["XD"])

    def test_rules(self):
        self.assertEqual(psx.price_band(312.11)["upper"], 343.32)
        self.assertEqual(psx.price_band(5)["lower"], 4.0)          # Rs 1 floor beats 10%
        self.assertAlmostEqual(psx.commission_per_share(4, 0.15), 0.03)
        self.assertAlmostEqual(psx.commission_per_share(200, 0.15), 0.3)
        self.assertEqual(psx.sessions("2026-11-09"), [])            # Iqbal Day
        self.assertEqual(psx.market_clock(psx.parse_pkt("2026-11-06 17:00"))["next_open"], "Tue 2026-11-10 09:32 PKT")


if __name__ == "__main__":
    unittest.main()
