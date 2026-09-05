#!/usr/bin/env python3
"""Intraday OHLCV via authenticated pypsx SDK."""

import json
import sys
from pathlib import Path

# Allow importing api/pypsx_lib when run from repo root
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))

from pypsx_lib import get_intraday_ohlcv  # noqa: E402


def main():
    symbol = (sys.argv[1] if len(sys.argv) > 1 else "").strip().upper()
    interval = (sys.argv[2] if len(sys.argv) > 2 else "5m").strip().lower()
    period = (sys.argv[3] if len(sys.argv) > 3 else "5d").strip().lower()
    if not symbol:
        print(json.dumps({"error": "symbol required"}))
        sys.exit(1)
    payload = get_intraday_ohlcv(symbol, interval=interval, period=period)
    print(json.dumps(payload))
    if payload.get("error"):
        sys.exit(2)


if __name__ == "__main__":
    main()
