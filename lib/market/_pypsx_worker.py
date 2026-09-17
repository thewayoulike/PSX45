"""Runs in a bounded subprocess so timed-out upstream SDK work is terminated."""
import json
import sys
from pypsx_lib import get_chart_analysis, get_company_info, get_dividend_snapshot, get_intraday_ohlcv, get_quote, get_quotes, get_index_symbols_payload

def compute(q):
    mode = q["mode"]
    symbol = q.get("symbol", q.get(mode, ""))
    if mode == "company": return get_company_info(symbol)
    if mode == "dividends": return get_dividend_snapshot(symbol)
    if mode == "analysis": return get_chart_analysis(symbol, q.get("period", "6mo"))
    if mode == "intraday": return get_intraday_ohlcv(symbol, interval=q.get("interval", "5m"), period=q.get("period", "5d"))
    if mode == "quote": return get_quote(symbol)
    if mode == "quotes": return get_quotes(q.get("symbols", symbol))
    return get_index_symbols_payload(q.get("index", q.get("name", "")))

if __name__ == "__main__":
    # Some upstream SDKs print progress to stdout. Keep protocol output separate.
    import contextlib
    with contextlib.redirect_stdout(sys.stderr):
        result = compute(json.loads(sys.argv[1]))
    print(json.dumps(result, default=str))
