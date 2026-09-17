"""Input and shared-budget validation, before importing expensive market libraries."""
import hashlib
import json
import os
import re
import urllib.request

SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9.-]{0,19}$", re.I)
PERIODS = {"1d", "5d", "1w", "1mo", "3mo", "6mo", "1y", "2y", "5y", "all", "max"}
INTERVALS = {"1m", "5m", "15m", "30m", "1h", "1d"}

def validate_query(q):
    mode = q.get("mode", "")
    if mode not in {"company", "dividends", "analysis", "intraday", "quote", "quotes", "indices"}:
        return "Invalid market-data mode"
    if mode == "quotes":
        symbols = q.get("symbols", q.get("symbol", "")).split(",")
        if len(symbols) > 20 or any(not SYMBOL.fullmatch(s) for s in symbols):
            return "Use at most 20 valid stock symbols"
    elif mode != "indices":
        if not SYMBOL.fullmatch(q.get("symbol", q.get(mode, ""))):
            return "Invalid stock symbol"
    if q.get("period") and q["period"] not in PERIODS:
        return "Invalid period"
    if q.get("interval") and q["interval"] not in INTERVALS:
        return "Invalid interval"
    if mode == "indices" and q.get("index", q.get("name", "")) not in {"", "KSE100", "KMI30", "KSE-100", "KMI-30"}:
        return "Invalid index"
    return None

def allowed_request(ip):
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/psx_rate_limit"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    payload = json.dumps({"p_key": hashlib.sha256(("market-python:" + ip).encode()).hexdigest(), "p_max": 120, "p_seconds": 60}).encode()
    request = urllib.request.Request(url, data=payload, headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.load(response) is True
