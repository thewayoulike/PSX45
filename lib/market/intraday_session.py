"""Turn the official PSX intraday tape into candles and append that session."""

import json
import urllib.request

INTERVAL_MS = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000}
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"


def parse_intraday_ticks(raw: str) -> list[dict]:
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    rows = parsed.get("data") if isinstance(parsed, dict) else None
    if not isinstance(rows, list):
        return []
    ticks = []
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        try:
            time = int(float(row[0]) * 1000)
            price = float(row[1])
            volume = float(row[2]) if len(row) > 2 and row[2] is not None else 0.0
        except (TypeError, ValueError):
            continue
        if time > 0 and price > 0:
            ticks.append({"time": time, "price": price, "volume": volume})
    return ticks


def candles_from_ticks(ticks: list[dict], interval_ms: int) -> list[dict]:
    if interval_ms <= 0:
        return []
    ordered = sorted((t for t in ticks if t.get("time", 0) > 0 and t.get("price", 0) > 0), key=lambda t: t["time"])
    buckets: dict[int, dict] = {}
    for tick in ordered:
        start = (int(tick["time"]) // interval_ms) * interval_ms
        bar = buckets.get(start)
        price = float(tick["price"])
        volume = float(tick.get("volume") or 0)
        if bar is None:
            buckets[start] = {"time": start, "open": price, "high": price, "low": price, "close": price, "volume": volume}
        else:
            bar["high"] = max(bar["high"], price)
            bar["low"] = min(bar["low"], price)
            bar["close"] = price
            bar["volume"] += volume
    return list(buckets.values())


def append_newer_bars(existing: list[dict], extra: list[dict]) -> list[dict]:
    last = max((int(bar.get("time") or 0) for bar in existing), default=0)
    newer = sorted((bar for bar in extra if int(bar.get("time") or 0) > last), key=lambda bar: bar["time"])
    return list(existing) + newer


def fetch_official_tape(symbol: str) -> str:
    clean = (symbol or "").strip().upper()
    if not clean:
        return ""
    page = urllib.request.Request("https://dps.psx.com.pk/", headers={"User-Agent": _UA, "Accept": "text/html"})
    with urllib.request.urlopen(page, timeout=10) as res:
        html = res.read().decode("utf-8", "replace")
    key = ""
    marker = '"_k":"'
    at = html.find(marker)
    if at >= 0:
        end = html.find('"', at + len(marker))
        key = html[at + len(marker):end]
    if not key:
        return ""
    tape = urllib.request.Request(
        f"https://dps.psx.com.pk/timeseries/int/{clean}",
        headers={
            "User-Agent": _UA,
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://dps.psx.com.pk/",
            "X-Requested-With": "XMLHttpRequest",
            "X-Req-Id": key,
        },
    )
    with urllib.request.urlopen(tape, timeout=15) as res:
        return res.read().decode("utf-8", "replace")


def attach_official_session(symbol: str, interval: str, bars: list[dict]) -> list[dict]:
    try:
        extra = candles_from_ticks(parse_intraday_ticks(fetch_official_tape(symbol)), INTERVAL_MS.get(interval, 300_000))
        return append_newer_bars(bars, extra)
    except Exception:
        return bars
