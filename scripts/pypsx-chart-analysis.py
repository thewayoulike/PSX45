#!/usr/bin/env python3
"""Price + Bollinger Bands + RSI + MACD via pypsx_toolkit (Colab §7b / §7c)."""

import json
import math
import sys

PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}


def flatten_columns(df):
    out = df.copy()
    out.columns = [c[-1] if isinstance(c, tuple) else c for c in out.columns]
    return out


def to_ms(idx):
    if hasattr(idx, "timestamp"):
        return int(idx.timestamp() * 1000)
    return int(idx)


def main():
    symbol = (sys.argv[1] if len(sys.argv) > 1 else "").strip().upper()
    period = (sys.argv[2] if len(sys.argv) > 2 else "6mo").strip().lower()
    if not symbol:
        print(json.dumps({"error": "symbol required"}))
        sys.exit(1)
    if period not in PERIODS:
        period = "6mo"

    try:
        import pypsx_toolkit as p
    except ImportError:
        print(json.dumps({"error": "pypsx-toolkit not installed", "hint": "pip install pypsx-toolkit"}))
        sys.exit(2)

    try:
        df = p.download(symbol, period=period, show_progress=False)
        if df is None or getattr(df, "empty", True):
            print(json.dumps({"error": "no data", "symbol": symbol}))
            sys.exit(3)

        flat = flatten_columns(df)
        upper, middle, lower = p.bollinger_bands(flat)
        rsi = p.rsi(flat)
        macd_line, signal_line, histogram = p.macd(flat)

        points = []
        for i, (idx, row) in enumerate(flat.iterrows()):
            try:
                u = float(upper.iloc[i])
                m = float(middle.iloc[i])
                lo = float(lower.iloc[i])
                r = float(rsi.iloc[i])
                c = float(row["CLOSE"])
            except (KeyError, TypeError, ValueError, IndexError):
                continue
            if any(math.isnan(x) for x in (u, m, lo, r, c)):
                continue
            pt = {
                "time": to_ms(idx),
                "close": c,
                "upper": u,
                "middle": m,
                "lower": lo,
                "rsi": r,
            }
            try:
                macd_v = float(macd_line.iloc[i])
                sig_v = float(signal_line.iloc[i])
                hist_v = float(histogram.iloc[i])
                if not any(math.isnan(x) for x in (macd_v, sig_v, hist_v)):
                    pt["macd"] = macd_v
                    pt["macdSignal"] = sig_v
                    pt["macdHist"] = hist_v
            except (TypeError, ValueError, IndexError):
                pass
            points.append(pt)

        print(
            json.dumps(
                {
                    "symbol": symbol,
                    "period": period,
                    "points": points,
                    "source": "pypsx",
                }
            )
        )
    except Exception as exc:
        print(json.dumps({"error": str(exc), "symbol": symbol, "period": period}))
        sys.exit(4)


if __name__ == "__main__":
    main()
