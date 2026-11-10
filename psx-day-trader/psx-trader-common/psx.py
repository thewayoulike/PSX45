"""Shared PSX library for the psx-trader-* skills. Standard library only.

Every skill imports this module for:
  - data: daily candles, the last session's trades, the full Market Watch
    snapshot, company pages and the news / insider feeds, all read through
    your PSX Tracker server (PSX does not serve scripts directly);
  - the PSX clock: Pakistan time, regular sessions, Friday break, holidays;
  - PSX rules: daily price limits, price step, trading charges;
  - the trader/ folder: config, JSON in and out.

Offline mode (tests, or replaying saved data): set PSX_OFFLINE_DIR to a folder
of saved responses named like the files in tests/fixtures/.

Rules mirror the PSX Trading Lab in the PSX Tracker app
(docs/trading-lab/adaptation.md). Check PSX notices for special hours,
holidays and limit changes before you rely on them.
"""
import datetime as _dt
import gzip
import html as _html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

VERSION = "0.1.0"
USER_AGENT = "psx-day-trader/%s (personal research tool)" % VERSION
DEFAULT_SERVER = "https://www.psx-tracker.com"

# ---------------------------------------------------------------- errors


class PsxError(Exception):
    """A problem worth showing the user in plain words."""


# ---------------------------------------------------------------- time
PKT = _dt.timezone(_dt.timedelta(hours=5), "PKT")
MINUTE_MS = 60_000
FIVE_MS = 5 * MINUTE_MS

# Fixed-date national holidays (MM-DD). Moon-dependent holidays (Eid, Ashura,
# Eid Milad) are announced shortly before: add them to "extra_holidays" in
# trader/config.json.
FIXED_HOLIDAYS = ["02-05", "03-23", "05-01", "05-28", "08-14", "11-09", "12-25"]

# Continuous trading windows, minutes after midnight PKT.
WEEKDAY_SESSION = [(572, 930, "Monday-Thursday")]                     # 09:32-15:30
FRIDAY_SESSIONS = [(557, 720, "Friday morning"), (872, 990, "Friday afternoon")]  # 09:17-12:00, 14:32-16:30
# Special hours by date range (inclusive). Ramadan 2026 per PSX notice N-209.
SPECIAL_HOURS = [
    {"from": "2026-02-19", "to": "2026-03-19", "label": "Ramadan",
     "weekday": [(557, 810)], "friday": [(557, 750)]},
]


def now_pkt():
    """Current time in Pakistan. PSX_NOW (YYYY-MM-DD HH:MM) overrides it for tests."""
    fixed = os.environ.get("PSX_NOW")
    if fixed:
        return parse_pkt(fixed)
    return _dt.datetime.now(PKT)


def parse_pkt(text):
    """'2026-11-06 10:15' or '2026-11-06' -> aware datetime in PKT."""
    text = str(text).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return _dt.datetime.strptime(text, fmt).replace(tzinfo=PKT)
        except ValueError:
            pass
    raise PsxError("Could not read the time %r. Use YYYY-MM-DD HH:MM in Pakistan time." % text)


def ms(dt):
    return int(dt.timestamp() * 1000)


def from_ms(t):
    return _dt.datetime.fromtimestamp(t / 1000, PKT)


def pkt_day(t_ms):
    return from_ms(t_ms).strftime("%Y-%m-%d")


def hhmm(t_ms):
    return from_ms(t_ms).strftime("%H:%M")


def _holidays(cfg=None):
    extra = (cfg or {}).get("extra_holidays") or []
    return set(extra)


def is_holiday(day, cfg=None):
    return day[5:] in FIXED_HOLIDAYS or day in _holidays(cfg)


def sessions(day, cfg=None):
    """Regular continuous sessions for a PKT date: [{start, end (ms), family}]."""
    d = _dt.datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=PKT)
    weekday = d.isoweekday()  # 1 = Monday ... 7 = Sunday
    if weekday >= 6 or is_holiday(day, cfg):
        return []
    special = next((s for s in SPECIAL_HOURS if s["from"] <= day <= s["to"]), None)
    if special:
        wins = special["friday"] if weekday == 5 else special["weekday"]
        label = "%s %s" % (special["label"], "Friday" if weekday == 5 else "Monday-Thursday")
        windows = [(a, b, label if len(wins) == 1 else "%s %d" % (label, i + 1)) for i, (a, b) in enumerate(wins)]
    else:
        windows = FRIDAY_SESSIONS if weekday == 5 else WEEKDAY_SESSION
    midnight = ms(d)
    return [{"start": midnight + a * MINUTE_MS, "end": midnight + b * MINUTE_MS, "family": f} for a, b, f in windows]


def market_clock(now=None, cfg=None):
    """Is PSX open now? Plus the next open and close, in plain fields."""
    now = now or now_pkt()
    t = ms(now)
    day = now.strftime("%Y-%m-%d")
    today = sessions(day, cfg)
    current = next((s for s in today if s["start"] <= t < s["end"]), None)
    nxt = None
    probe = now
    for _ in range(15):
        for s in sessions(probe.strftime("%Y-%m-%d"), cfg):
            if s["start"] > t:
                nxt = s
                break
        if nxt:
            break
        probe = (probe + _dt.timedelta(days=1)).replace(hour=0, minute=0)
    return {
        "now": now.strftime("%Y-%m-%d %H:%M PKT"),
        "open": current is not None,
        "session": current["family"] if current else None,
        "closes_at": hhmm(current["end"]) if current else None,
        "next_open": from_ms(nxt["start"]).strftime("%a %Y-%m-%d %H:%M PKT") if nxt else None,
        "note": "Standard hours. Check PSX notices for special hours and newly announced holidays.",
    }


# ---------------------------------------------------------------- PSX rules
PRICE_TICK = 0.01
SALES_TAX_ON_COMMISSION = 0.15      # Sindh sales tax on brokerage
CDC_FEE_PER_SHARE = 0.005
EXCHANGE_FEE_RATE = (3.5 + 0.65 + 1.11) / 100000  # PSX fee, SECP levy, NCCPL fee per Rs 100,000, each side


def round_tick(price):
    return round(round(price / PRICE_TICK) * PRICE_TICK, 2)


def price_band(prev_close):
    """Standard daily limit (PSX Regulations 19.3): prior close +/- max(10%, Rs 1).
    An estimate: special bands, corporate actions and new listings differ."""
    if not prev_close or prev_close <= 0:
        return None
    dist = max(prev_close * 0.10, 1.0)
    return {"lower": max(0.01, round(prev_close - dist, 2)), "upper": round(prev_close + dist, 2),
            "basis": "estimate from prior close %.2f (+/- max 10%%, Rs 1)" % prev_close}


def commission_per_share(price, fee_pct):
    """Broker commission per share, one side: Rs 0.03 at Rs 5 or below, Rs 0.05 below Rs 10,
    otherwise the larger of Rs 0.05 or the percentage."""
    if price <= 5:
        return 0.03
    if price < 10:
        return 0.05
    return max(0.05, price * fee_pct / 100)


def charges_per_share(price, fee_pct, with_commission=True):
    """Commission with 15% sales tax, CDC fee and exchange fees, one side. fee_pct 0 = no charges."""
    if not fee_pct or fee_pct <= 0:
        return 0.0
    commission = commission_per_share(price, fee_pct) * (1 + SALES_TAX_ON_COMMISSION) if with_commission else 0.0
    return commission + CDC_FEE_PER_SHARE + price * EXCHANGE_FEE_RATE


def _slip(price, slip_pct):
    return max(price * slip_pct / 100, PRICE_TICK) if slip_pct and slip_pct > 0 else 0.0


def buy_cost(price, fee_pct, slip_pct=0.0):
    """Cost per share bought, after slippage and charges."""
    px = price + _slip(price, slip_pct)
    return px + charges_per_share(px, fee_pct)


def sell_proceeds(price, fee_pct, slip_pct=0.0, one_side=False):
    """Money per share sold, after slippage and charges. one_side: broker waives
    the second commission on a same-day round trip."""
    px = price - _slip(price, slip_pct)
    return px - charges_per_share(px, fee_pct, not one_side)


def net_per_share(entry, exit_, fee_pct, slip_pct=0.0, one_side=False):
    return sell_proceeds(exit_, fee_pct, slip_pct, one_side) - buy_cost(entry, fee_pct, slip_pct)


def cgt(gain, rate_pct):
    """Capital gains tax on a net gain (losses are not taxed)."""
    return gain * rate_pct / 100 if gain > 0 else 0.0


# ---------------------------------------------------------------- config / files
DEFAULT_CONFIG = {
    "server": DEFAULT_SERVER,       # your PSX Tracker site; data is read through its /api/proxy
    "capital": 500000,              # Rs in the trading account
    "max_loss_per_trade": 5000,     # Rs you accept losing if the stop fills
    "max_position_pct": 25,         # largest single position, % of capital
    "cash_buffer_pct": 10,          # % of capital never spent
    "daily_loss_limit": 15000,      # Rs: stop trading for the day after this much loss
    "max_trades_per_day": 3,
    "min_reward_risk": 1.5,
    "fee_pct": 0.15,                # broker commission %, each side (charges are added on top)
    "slip_pct": 0.05,               # slippage % each side (at least one price step)
    "one_side_commission": False,   # some brokers waive commission on the same-day sale
    "lot_size": 1,
    "cgt_pct": 15,                  # filer rate; check your own
    "entry_window_minutes": [15, 120],  # entries allowed from 15 to 120 minutes after each session opens
    "flat_by_minutes": 5,           # close day trades this many minutes before the session ends
    "min_price": 5,
    "min_volume": 100000,
    "extra_holidays": [],
    "paper": True,
}


def trader_dir():
    return os.path.abspath(os.environ.get("PSX_TRADER_DIR") or "trader")


def path(*parts):
    return os.path.join(trader_dir(), *parts)


def read_json(p, what="file", required=True):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        if required:
            raise PsxError("No %s yet (%s)." % (what, p))
        return None
    except json.JSONDecodeError as e:
        raise PsxError("%s is not valid JSON (%s): %s" % (what, p, e))


def write_json(p, data):
    os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, p)
    return p


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    user = read_json(path("config.json"), "config", required=False) or {}
    cfg.update({k: v for k, v in user.items() if not k.startswith("_")})
    return cfg


# ---------------------------------------------------------------- network
_last_call = [0.0]


def _offline_file(name):
    root = os.environ.get("PSX_OFFLINE_DIR")
    if not root:
        return None
    for candidate in (name, name + ".gz"):
        p = os.path.join(root, candidate)
        if os.path.exists(p):
            with open(p, "rb") as f:
                raw = f.read()
            return gzip.decompress(raw) if p.endswith(".gz") else raw
    raise PsxError("Offline mode: no saved response %s in %s." % (name, root))


def _get(params, offline_name, cfg=None, retries=3, pause=0.6, endpoint="/api/proxy", timeout=60):
    saved = _offline_file(offline_name)
    if saved is not None:
        return saved
    server = ((cfg or {}).get("server") or DEFAULT_SERVER).rstrip("/")
    url = server + endpoint + "?" + urllib.parse.urlencode(params)
    delay = 2.0
    for attempt in range(retries):
        wait = _last_call[0] + pause - time.time()
        if wait > 0:
            time.sleep(wait)
        _last_call[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            if e.code == 429:
                raise PsxError("The PSX Tracker server is limiting requests (120 a minute). Wait a minute and try again.")
            raise PsxError("The PSX Tracker server answered HTTP %d for %s." % (e.code, _describe(params)))
        except urllib.error.URLError as e:
            if attempt < retries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise PsxError("Could not reach %s: %s" % (server, getattr(e, "reason", e)))
    raise PsxError("No answer for %s." % _describe(params))


def _describe(params):
    return ", ".join("%s=%s" % kv for kv in params.items())


def _json(raw, what):
    try:
        return json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise PsxError("%s was not JSON (PSX may be down or busy)." % what)


def clean_symbol(sym):
    s = str(sym or "").strip().upper()
    if not re.match(r"^[A-Z0-9][A-Z0-9.\-]{0,19}$", s):
        raise PsxError("%r is not a PSX symbol." % sym)
    return s


# ---------------------------------------------------------------- data: candles


def daily_bars(symbol, cfg=None):
    """Daily candles, oldest first: [{t (ms), o, h, l, c, v}]. Years of history."""
    s = clean_symbol(symbol)
    data = _json(_get({"ohlc": s}, "ohlc-%s.json" % s, cfg), "Daily candles for %s" % s)
    out = {}
    for b in data.get("bars") or []:
        try:
            t, o, h, l, c = int(b["time"]), float(b["open"]), float(b["high"]), float(b["low"]), float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if min(o, h, l, c) <= 0 or h < max(o, c) or l > min(o, c):
            continue
        v = b.get("volume")
        out[t] = {"t": t, "o": o, "h": h, "l": l, "c": c, "v": float(v) if isinstance(v, (int, float)) else None}
    return [out[k] for k in sorted(out)]


def completed_daily(bars, now=None, cfg=None):
    """Drop today's candle until today's last session has ended."""
    now = now or now_pkt()
    today = now.strftime("%Y-%m-%d")
    last = (sessions(today, cfg) or [None])[-1]
    return [b for b in bars if pkt_day(b["t"]) < today or (pkt_day(b["t"]) == today and last and ms(now) >= last["end"])]


def ticks(symbol, cfg=None):
    """Trades of the latest session PSX publishes: [(t_ms, price, volume)], oldest first."""
    s = clean_symbol(symbol)
    raw = _get({"url": "https://dps.psx.com.pk/timeseries/int/%s" % s}, "int-%s.json" % s, cfg)
    data = _json(raw, "Intraday trades for %s" % s)
    rows = []
    for r in data.get("data") or []:
        try:
            t, p, v = int(r[0]), float(r[1]), float(r[2])
        except (IndexError, TypeError, ValueError):
            continue
        if p > 0:
            rows.append((t * 1000 if t < 10**12 else t, p, v))
    rows.sort(key=lambda x: x[0])
    return rows


def ticks_to_bars(rows, minutes=5, cfg=None, now=None):
    """Build candles from trades on the PKT grid, regular sessions only.
    Each bar: {t, o, h, l, c, v, family, day}. Unfinished bars are dropped."""
    size = minutes * MINUTE_MS
    now_ms = ms(now or now_pkt())
    bars = {}
    for t, p, v in rows:
        start = t - (t % size)
        if start + size > now_ms:
            continue
        day = pkt_day(start)
        win = next((s for s in sessions(day, cfg) if s["start"] <= start and start + size <= s["end"]), None)
        if not win:
            continue  # auction, Friday break, after close
        b = bars.get(start)
        if b is None:
            bars[start] = {"t": start, "o": p, "h": p, "l": p, "c": p, "v": v, "family": win["family"], "day": day}
        else:
            b["h"] = max(b["h"], p)
            b["l"] = min(b["l"], p)
            b["c"] = p
            b["v"] += v
    return [bars[k] for k in sorted(bars)]


def segments(bars, minutes=5, cfg=None, now=None):
    """Group intraday bars by session. A session is complete when it has ended and
    every grid slot from the first full candle to the last has a candle.
    Thin stocks with no trade in a slot are filled flat with zero volume and
    flagged in 'filled', so the caller can decide."""
    size = minutes * MINUTE_MS
    now_ms = ms(now or now_pkt())
    groups = {}
    for b in bars:
        day = pkt_day(b["t"])
        win = next((s for s in sessions(day, cfg) if s["start"] <= b["t"] and b["t"] + size <= s["end"]), None)
        if not win:
            continue
        key = (day, win["family"])
        g = groups.setdefault(key, {"day": day, "family": win["family"], "start": win["start"], "end": win["end"], "bars": []})
        g["bars"].append(b)
    out = []
    for g in sorted(groups.values(), key=lambda x: x["start"]):
        first = -(-g["start"] // size) * size
        have = {b["t"]: b for b in g["bars"]}
        filled, seq = [], []
        last_close = None
        t = first
        while t + size <= g["end"] and t + size <= now_ms:
            if t in have:
                seq.append(have[t])
                last_close = have[t]["c"]
            elif last_close is not None:
                seq.append({"t": t, "o": last_close, "h": last_close, "l": last_close, "c": last_close, "v": 0.0,
                            "family": g["family"], "day": g["day"], "filled": True})
                filled.append(hhmm(t))
            t += size
        g["bars"] = seq
        g["filled"] = filled
        g["complete"] = g["end"] <= now_ms and bool(seq) and seq[0]["t"] == first and seq[-1]["t"] == g["end"] - size
        out.append(g)
    return out


def history_bars(symbol, period="all", cfg=None, now=None):
    """Past 5-minute candles from your PSX Tracker server's intraday history (about a
    year, from 20 Oct 2025), regular sessions only, plus the days the source marks as
    bad data. Returns (bars in the same shape as ticks_to_bars, set of bad days)."""
    s = clean_symbol(symbol)
    if period not in ("1mo", "all"):
        raise PsxError("History period must be 1mo or all.")
    raw = _get({"mode": "intraday", "symbol": s, "interval": "5m", "period": period},
               "hist-%s.json" % s, cfg, endpoint="/api/pypsx", timeout=150, pause=1.0)
    data = _json(raw, "Intraday history for %s" % s)
    if data.get("error"):
        raise PsxError("Intraday history for %s: %s" % (s, data["error"]))
    bad = set()
    for g in data.get("gaps") or []:
        try:
            d = _dt.date.fromisoformat(g["start"])
            end = _dt.date.fromisoformat(g.get("end") or g["start"])
        except (KeyError, TypeError, ValueError):
            continue
        while d <= end:
            bad.add(d.isoformat())
            d += _dt.timedelta(days=1)
    now_ms = ms(now or now_pkt())
    out = {}
    for b in data.get("bars") or []:
        try:
            t, o, h, l, c = int(b["time"]), float(b["open"]), float(b["high"]), float(b["low"]), float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if t % FIVE_MS or t + FIVE_MS > now_ms or min(o, h, l, c) <= 0 or h < max(o, c) or l > min(o, c):
            continue
        day = pkt_day(t)
        if day in bad:
            continue
        win = next((x for x in sessions(day, cfg) if x["start"] <= t and t + FIVE_MS <= x["end"]), None)
        if not win:
            continue
        v = b.get("volume")
        out[t] = {"t": t, "o": o, "h": h, "l": l, "c": c, "v": float(v) if isinstance(v, (int, float)) else 0.0,
                  "family": win["family"], "day": day}
    return [out[k] for k in sorted(out)], bad


def recorded_bars(symbol):
    """5-minute candles you saved earlier with record_session(), oldest first."""
    folder = path("bars", clean_symbol(symbol))
    out = []
    if os.path.isdir(folder):
        for name in sorted(os.listdir(folder)):
            if name.endswith(".json"):
                out.extend((read_json(os.path.join(folder, name), "saved candles", required=False) or {}).get("bars") or [])
    return out


def record_session(symbol, cfg=None, now=None):
    """Save the latest session's 5-minute candles to trader/bars/SYMBOL/DATE.json.
    PSX only publishes the latest session's trades, so the Time Machine builds its
    history from what you record each day."""
    s = clean_symbol(symbol)
    bars = ticks_to_bars(ticks(s, cfg), 5, cfg, now)
    if not bars:
        raise PsxError("No trades for %s in the latest session." % s)
    by_day = {}
    for b in bars:
        by_day.setdefault(b["day"], []).append(b)
    written = []
    for day, rows in by_day.items():
        p = path("bars", s, "%s.json" % day)
        write_json(p, {"symbol": s, "day": day, "minutes": 5, "source": "PSX trades via PSX Tracker", "bars": rows})
        written.append(p)
    return written


# ---------------------------------------------------------------- data: market watch


def _num(text):
    text = re.sub(r"<[^>]+>", "", text or "").replace(",", "").replace("%", "").strip()
    try:
        return float(text)
    except ValueError:
        return None


def market_watch(cfg=None):
    """Every symbol on PSX Market Watch: [{symbol, name, sector, listed_in, ldcp,
    open, high, low, current, change, change_pct, volume}]."""
    raw = _get({"url": "https://dps.psx.com.pk/market-watch"}, "market-watch.html", cfg).decode("utf-8", "replace")
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", raw, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(cells) < 11:
            continue
        m = re.search(r'data-title="([^"]*)"', cells[0])
        # The symbol cell can also hold badges (XD, XB, XR...): read the symbol from its own field.
        sm = re.search(r'data-search="([^"]+)"', tr) or re.search(r"<strong>([^<]+)</strong>", cells[0])
        sym = (sm.group(1) if sm else re.sub(r"<[^>]+>", "", cells[0])).strip()
        if not sym:
            continue
        flags = [f.strip() for f in re.findall(r'<div class="tag[^"]*">([^<]+)</div>', cells[0])]
        rows.append({
            "symbol": sym.upper(), "name": _html.unescape(m.group(1)) if m else sym, "flags": flags,
            "sector": re.sub(r"<[^>]+>", "", cells[1]).strip(),
            "listed_in": re.sub(r"<[^>]+>", "", cells[2]).strip(),
            "ldcp": _num(cells[3]), "open": _num(cells[4]), "high": _num(cells[5]), "low": _num(cells[6]),
            "current": _num(cells[7]), "change": _num(cells[8]), "change_pct": _num(cells[9]), "volume": _num(cells[10]),
        })
    if not rows:
        raise PsxError("PSX Market Watch came back empty (PSX may be busy). Try again in a minute.")
    seen, out = set(), []
    for r in rows:
        if r["symbol"] not in seen:
            seen.add(r["symbol"])
            out.append(r)
    return out


def quotes(symbols, cfg=None):
    """{SYMBOL: market watch row} for the given symbols (one request for all)."""
    want = {clean_symbol(s) for s in symbols}
    return {r["symbol"]: r for r in market_watch(cfg) if r["symbol"] in want}


# ---------------------------------------------------------------- data: company, news, insiders


def company_page(symbol, cfg=None):
    s = clean_symbol(symbol)
    return _get({"url": "https://dps.psx.com.pk/company/%s" % s}, "company-%s.html" % s, cfg).decode("utf-8", "replace")


def feed(name, cfg=None):
    if name not in ("news", "insiders"):
        raise PsxError("Unknown feed %r." % name)
    data = _json(_get({"feed": name}, "feed-%s.json" % name, cfg), "The %s feed" % name)
    return data.get("data") or {}


def strip_tags(text):
    return _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text or ""))).strip()


# ---------------------------------------------------------------- indicators


def sma(values, n):
    return sum(values[-n:]) / n if len(values) >= n else None


def rsi(closes, period=14):
    """Wilder RSI of the whole series, or None if too short."""
    if len(closes) <= period:
        return None
    gain = loss = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gain += max(d, 0) / period
        loss += max(-d, 0) / period
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        gain = (gain * (period - 1) + max(d, 0)) / period
        loss = (loss * (period - 1) + max(-d, 0)) / period
    if not loss:
        return 50.0 if not gain else 100.0
    return 100 - 100 / (1 + gain / loss)


def atr(bars, period=14):
    if len(bars) <= period:
        return None
    trs = [max(b["h"] - b["l"], abs(b["h"] - p["c"]), abs(b["l"] - p["c"])) for p, b in zip(bars, bars[1:])]
    return sum(trs[-period:]) / period


# ---------------------------------------------------------------- output


def rs(x, dp=2):
    return "Rs. {:,.{}f}".format(x, dp) if x is not None else "-"


def table(rows, cols):
    """Plain text table. cols: [(header, key or callable)]."""
    data = [[str(c(r) if callable(c) else r.get(c, "")) for _, c in cols] for r in rows]
    heads = [h for h, _ in cols]
    widths = [max([len(h)] + [len(d[i]) for d in data]) for i, h in enumerate(heads)]
    line = lambda vals: "  ".join(v.ljust(w) for v, w in zip(vals, widths)).rstrip()
    return "\n".join([line(heads), line(["-" * w for w in widths])] + [line(d) for d in data])


def run(main):
    """Run a CLI main(); show PsxError in plain words with exit code 2."""
    try:
        sys.exit(main() or 0)
    except PsxError as e:
        print("Error: %s" % e, file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        sys.exit(130)
