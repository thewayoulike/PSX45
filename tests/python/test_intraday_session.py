import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lib" / "market"))
from intraday_session import append_newer_bars, candles_from_ticks, parse_intraday_ticks

PKT = timezone(timedelta(hours=5))


def pkt(hour, minute, second=0):
    return int(datetime(2026, 9, 28, hour, minute, second, tzinfo=PKT).timestamp() * 1000)


class IntradaySession(unittest.TestCase):
    def test_five_minute_candles_keep_first_open_and_last_close(self):
        candles = candles_from_ticks(
            [
                {"time": pkt(9, 36), "price": 9, "volume": 4},
                {"time": pkt(9, 30, 10), "price": 10, "volume": 1},
                {"time": pkt(9, 32), "price": 12, "volume": 2},
                {"time": pkt(9, 34), "price": 11, "volume": 3},
            ],
            5 * 60 * 1000,
        )
        self.assertEqual(candles, [
            {"time": pkt(9, 30), "open": 10, "high": 12, "low": 10, "close": 11, "volume": 6},
            {"time": pkt(9, 35), "open": 9, "high": 9, "low": 9, "close": 9, "volume": 4},
        ])

    def test_appends_28_sep_after_25_sep_and_skips_duplicates(self):
        older = [{"time": int(datetime(2026, 9, 25, 16, 25, tzinfo=PKT).timestamp() * 1000), "close": 1}]
        today = [{"time": pkt(9, 30), "close": 2}]
        self.assertEqual(append_newer_bars(older, today), older + today)
        self.assertEqual(append_newer_bars([today[0]], today + [{"time": pkt(9, 35), "close": 3}]), [today[0], {"time": pkt(9, 35), "close": 3}])

    def test_parse_ignores_bad_rows(self):
        raw = '{"data":[[1790569800,316.5,423],[0,1,1],[1790569860,0,5]]}'
        self.assertEqual(parse_intraday_ticks(raw), [{"time": 1790569800000, "price": 316.5, "volume": 423.0}])


if __name__ == "__main__":
    unittest.main()
