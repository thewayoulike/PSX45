#!/usr/bin/env python3
"""Local CLI for pypsx_lib modes: quote | quotes | indices | intraday."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))

from pypsx_lib import (  # noqa: E402
    get_quote,
    get_quotes,
    get_index_symbols_payload,
    get_intraday_ohlcv,
)


def main():
    mode = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
    if mode == "quote":
        symbol = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(get_quote(symbol)))
    elif mode == "quotes":
        symbols = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(get_quotes(symbols)))
    elif mode == "indices":
        name = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(get_index_symbols_payload(name)))
    elif mode == "intraday":
        symbol = sys.argv[2] if len(sys.argv) > 2 else ""
        interval = sys.argv[3] if len(sys.argv) > 3 else "5m"
        period = sys.argv[4] if len(sys.argv) > 4 else "5d"
        print(json.dumps(get_intraday_ohlcv(symbol, interval=interval, period=period)))
    else:
        print(json.dumps({"error": "usage: quote|quotes|indices|intraday ..."}))
        sys.exit(1)


if __name__ == "__main__":
    main()
