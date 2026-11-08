#!/usr/bin/env python3
"""Chart Scanner for psx-trader-scanner: lists PSX charts that match a rule.
Standard library only. Long side only. It never places an order.

    python3 psx-trader-scanner/scan.py universe                    # liquid Market Watch symbols
    python3 psx-trader-scanner/scan.py universe --index KSE100 --write
    python3 psx-trader-scanner/scan.py daily                       # setups on completed daily candles
    python3 psx-trader-scanner/scan.py daily --symbols OGDC,HUBC --write
    python3 psx-trader-scanner/scan.py orb                         # opening-range breakouts, latest session
    python3 psx-trader-scanner/scan.py orb --at 10:15 --volume-x 1.5

universe  every symbol on PSX Market Watch (one request), kept when the price
          is at least --min-price and the session's volume at least
          --min-volume (config min_price / min_volume). --sector CODE or name,
          --index KSE100 (the "listed in" column). --write saves
          trader/universe.txt (one SYMBOL|Name a line).
daily     on completed daily candles (today's candle only after the close):
          20-day closing breakout, bull flag, reclaimed 20-day average, RSI
          below 30, oversold bounce, RSI recovery, plus volume against its
          20-day average. One request per symbol: --limit N (default 60, most
          traded first).
orb       opening-range breakouts in the latest session from 5-minute
          candles built from PSX trades. Range = the first 3 complete candles
          of the session (09:35, 09:20, or 14:35 on Friday afternoon). Trigger
          = the first candle that CLOSES above the range high. A missing
          candle before that invalidates the chart. --volume-x X also needs
          the trigger candle's volume at X times the range average.
          --at HH:MM replays the latest session up to that time.

Exit codes: 0 = something matched (or universe listed), 1 = nothing matched,
2 = could not run (the reason is printed in plain words).
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

FIVE = psx.FIVE_MS
MIN = psx.MINUTE_MS
SOURCE = "PSX via your PSX Tracker server (unofficial, can lag)"


# ---------------------------------------------------------------- helpers


def _mean(xs):
    return sum(xs) / len(xs)


def traded_value(row):
    p, v = row.get("current"), row.get("volume")
    return p * v if p is not None and v is not None else -1


def filter_universe(rows, min_price=0, min_volume=0, sector=None, index=None):
    """Market Watch rows kept by price, volume, sector and index, most traded first."""
    out = []
    for r in rows:
        if r.get("current") is None or r["current"] < min_price:
            continue
        if (r.get("volume") or 0) < min_volume:
            continue
        if sector:
            s = sector.strip().lower()
            if s != (r.get("sector") or "").lower() and s not in (r.get("name") or "").lower():
                continue
        if index:
            if index.strip().upper() not in [x.strip().upper() for x in (r.get("listed_in") or "").split(",")]:
                continue
        out.append(r)
    return sorted(out, key=lambda r: (-traded_value(r), r["symbol"]))


def read_watchlist(p):
    """A scan.json (results[].symbol), a JSON list, or a text file (SYMBOL or SYMBOL|Name a line)."""
    try:
        with open(p, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        raise psx.PsxError("Could not read the watchlist %s: %s" % (p, e))
    try:
        data = json.loads(text)
    except ValueError:
        data = None
    if isinstance(data, dict):
        syms = [r.get("symbol") for r in data.get("results") or data.get("hits") or []]
    elif isinstance(data, list):
        syms = [x.get("symbol") if isinstance(x, dict) else x for x in data]
    else:
        syms = [line.split("|")[0].split(",")[0] for line in text.splitlines()]
    out = []
    for s in syms:
        s = (s or "").strip()
        if s and not s.startswith("#"):
            s = psx.clean_symbol(s)
            if s not in out:
                out.append(s)
    if not out:
        raise psx.PsxError("The watchlist %s has no symbols." % p)
    return out


# ---------------------------------------------------------------- daily patterns (engine.ts dailyScan)


def daily_scan(bars, now=None, cfg=None):
    """Setups on completed daily candles. Mirrors the PSX Trading Lab's dailyScan."""
    rows = psx.completed_daily(bars, now, cfg)
    if len(rows) < 22:
        raise psx.PsxError("At least 22 completed daily candles are needed (found %d)." % len(rows))
    last = rows[-1]
    closes = [b["c"] for b in rows]
    prior = closes[-21:-1]
    ma20 = _mean(closes[-20:])
    prev_ma = _mean(closes[-21:-1])
    strength = psx.rsi(closes)
    prev_rsi = psx.rsi(closes[:-1])
    setups = []
    if last["c"] > max(prior):
        setups.append("20-day closing breakout")
    run = closes[-6] / closes[-16] - 1
    flag_range = (max(closes[-5:]) - min(closes[-5:])) / last["c"]
    if run > 0.10 and flag_range < 0.05:
        setups.append("Bull flag")
    if closes[-2] < prev_ma and last["c"] > ma20:
        setups.append("Reclaimed 20-day average")
    if strength is not None and strength < 30:
        setups.append("RSI below 30")
    if prev_rsi is not None and prev_rsi < 30 and last["c"] > closes[-2]:
        setups.append("Oversold bounce")
    if prev_rsi is not None and strength is not None and prev_rsi < 30 and strength >= 30:
        setups.append("RSI recovery")
    vols = [b["v"] for b in rows[-21:-1]]
    avg_volume = _mean(vols) if all(v is not None for v in vols) else None
    rel = last["v"] / avg_volume if avg_volume and last["v"] is not None else None
    return {"date": psx.pkt_day(last["t"]), "close": last["c"], "volume": last["v"],
            "change_pct": (last["c"] / closes[-2] - 1) * 100, "ma20": ma20, "rsi": strength,
            "setups": setups, "avg_volume": avg_volume, "relative_volume": rel}


# ---------------------------------------------------------------- opening range (engine.ts openingRange)


def first_full(start):
    """Start of the first complete 5-minute candle of a session (09:35, 09:20, 14:35)."""
    return -(-start // FIVE) * FIVE


def entry_window(session, cfg):
    """(from, to) in ms: entry_window_minutes after the first full candle, never after the flat-by time."""
    a, b = (cfg.get("entry_window_minutes") or [15, 120])[:2]
    first = first_full(session["start"])
    return first + int(a) * MIN, min(first + int(b) * MIN, session["end"] - int(cfg.get("flat_by_minutes", 5)) * MIN)


def opening_range(bars, start, volume_x=0.0):
    """bars: one session's completed 5-minute candles (raw, oldest first).
    Range = the first 3 candles from the first full slot. Trigger = first close above the range
    high (and volume >= volume_x x the range average when volume_x > 0). A missing candle before the
    trigger invalidates the scan: it could hide an earlier trigger. Returns None when the range is
    not complete."""
    first = first_full(start)
    rng = [b for b in bars if not b.get("filled")][:3]
    if len(rng) != 3 or any(b["t"] != first + i * FIVE for i, b in enumerate(rng)):
        return None
    high, low = max(b["h"] for b in rng), min(b["l"] for b in rng)
    avg = _mean([b["v"] for b in rng])
    out = {"high": high, "low": low, "mid": (high + low) / 2, "avg_volume": avg, "trigger": None, "index": -1,
           "volume_ratio": None, "gap_at": None, "range_end": first + 3 * FIVE}
    for i in range(3, len(bars)):
        b = bars[i]
        if b.get("filled") or b["t"] - bars[i - 1]["t"] != FIVE:
            out["gap_at"] = psx.hhmm(bars[i - 1]["t"] + FIVE)
            break
        if b["c"] > high:
            ratio = b["v"] / avg if avg else None
            if volume_x and (ratio is None or ratio < volume_x):
                continue
            out.update(trigger=b, index=i, volume_ratio=ratio)
            break
    return out


def pick_session(bars, now, cfg=None):
    """The session to read at `now`: the open one (never a substitute for it), else the latest
    session of the data that has started by now. Returns (session dict, its bars)."""
    t = psx.ms(now)
    today = psx.sessions(now.strftime("%Y-%m-%d"), cfg)
    active = next((s for s in today if s["start"] <= t < s["end"]), None)
    if active:
        sess = dict(active, day=now.strftime("%Y-%m-%d"))
    else:
        days = sorted({b["day"] for b in bars})
        sess = None
        for day in reversed(days):
            started = [s for s in psx.sessions(day, cfg) if s["start"] <= t]
            if started:
                sess = dict(started[-1], day=day)
                break
        if sess is None:
            return None, []
    return sess, [b for b in bars if b["day"] == sess["day"] and b["family"] == sess["family"]]


def latest_day(rows):
    return psx.pkt_day(rows[-1][0]) if rows else None


# ---------------------------------------------------------------- symbol lists


def build_list(args, cfg, mw, need_value=True):
    """Symbols to scan, most traded first, plus the Market Watch rows by symbol."""
    by_sym = {r["symbol"]: r for r in mw or []}
    if args.symbols:
        syms = []
        for s in args.symbols.split(","):
            if s.strip():
                s = psx.clean_symbol(s)
                if s not in syms:
                    syms.append(s)
        return syms, by_sym, len(syms)
    if args.watchlist:
        syms = read_watchlist(args.watchlist)
        return syms, by_sym, len(syms)
    if not mw:
        raise psx.PsxError("Market Watch is unavailable, so there is no universe. Give --symbols instead.")
    rows = filter_universe(mw, args.min_price, args.min_volume, args.sector, args.index)
    return [r["symbol"] for r in rows], by_sym, len(rows)


def progress(i, n, sym, quiet):
    if not quiet:
        print("[%d/%d] %s" % (i, n, sym), file=sys.stderr, flush=True)


# ---------------------------------------------------------------- commands


def cmd_universe(args, cfg):
    mw = psx.market_watch(cfg)
    rows = filter_universe(mw, args.min_price, args.min_volume, args.sector, args.index)
    now = psx.now_pkt()
    print("PSX Market Watch, read %s: %d symbols, %d with price >= %s and volume >= %s%s%s."
          % (now.strftime("%Y-%m-%d %H:%M PKT"), len(mw), len(rows), psx.rs(args.min_price), "{:,.0f}".format(args.min_volume),
             " in sector %s" % args.sector if args.sector else "", " in %s" % args.index.upper() if args.index else ""))
    if args.json:
        print(json.dumps(rows, indent=2))
    elif rows:
        print(psx.table(rows[:args.show], [
            ("Symbol", "symbol"), ("Price", lambda r: "%.2f" % r["current"]),
            ("Change", lambda r: "%+.2f%%" % r["change_pct"] if r.get("change_pct") is not None else "-"),
            ("Volume", lambda r: "{:,.0f}".format(r["volume"] or 0)), ("Name", lambda r: r["name"][:40])]))
        if len(rows) > args.show:
            print("... and %d more (most traded first)." % (len(rows) - args.show))
    if args.write:
        p = psx.path("universe.txt")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write("".join("%s|%s\n" % (r["symbol"], r["name"]) for r in rows))
        print("Wrote %s" % p)
    return 0 if rows else 1


def scan_daily(syms, by_sym, cfg, now, quiet=False):
    results, failed, short = [], [], []
    for i, sym in enumerate(syms, 1):
        progress(i, len(syms), sym, quiet)
        try:
            d = daily_scan(psx.daily_bars(sym, cfg), now, cfg)
        except psx.PsxError as e:
            (short if "daily candles are needed" in str(e) else failed).append({"symbol": sym, "reason": str(e)})
            continue
        if not d["setups"]:
            continue
        q = by_sym.get(sym) or {}
        notes = ["RSI %.1f" % d["rsi"] if d["rsi"] is not None else "RSI not available",
                 "20-day average %.2f" % d["ma20"], "last completed candle %s" % d["date"]]
        results.append({"symbol": sym, "name": q.get("name", sym), "setup": d["setups"][0], "setups": d["setups"],
                        "price": d["close"], "change_pct": round(d["change_pct"], 2), "volume": d["volume"],
                        "relative_volume": round(d["relative_volume"], 2) if d["relative_volume"] is not None else None,
                        "rsi": round(d["rsi"], 2) if d["rsi"] is not None else None, "ma20": round(d["ma20"], 2),
                        "date": d["date"], "notes": notes})
    return results, failed, short


def cmd_daily(args, cfg):
    now = psx.parse_pkt(args.now) if args.now else psx.now_pkt()
    try:
        mw = psx.market_watch(cfg)
    except psx.PsxError as e:
        if not (args.symbols or args.watchlist):
            raise
        mw = None
        print("Note: Market Watch unavailable (%s); names are left blank." % e, file=sys.stderr)
    syms, by_sym, universe = build_list(args, cfg, mw)
    total = len(syms)
    if args.limit and args.limit > 0:
        syms = syms[:args.limit]
    results, failed, short = scan_daily(syms, by_sym, cfg, now, args.quiet)
    dates = sorted({r["date"] for r in results})
    print("Daily scan as of %s on completed daily candles%s." % (
        now.strftime("%Y-%m-%d %H:%M PKT"), " (last candle %s)" % dates[-1] if dates else ""))
    print("Scanned %d of %d symbols%s; %d could not be read, %d have too little history; %d matched a rule."
          % (len(syms), total, " (the %d most traded)" % len(syms) if len(syms) < total else "",
             len(failed), len(short), len(results)))
    order = {s: i for i, s in enumerate(syms)}
    results.sort(key=lambda r: order[r["symbol"]])
    _print_results(results, "daily", args)
    for f in failed:
        print("  could not read %s: %s" % (f["symbol"], f["reason"]))
    out = {"as_of": now.strftime("%Y-%m-%d %H:%M PKT"), "mode": "daily", "universe": universe, "scanned": len(syms),
           "source": SOURCE + ", daily candles", "results": results, "failed": failed + short}
    _finish(args, out)
    return 0 if results else 1


def orb_row(sym, rows, now, cfg, volume_x=0.0, quote=None):
    """Opening-range breakout check for one symbol's trades. Returns (row or None, reason)."""
    bars = psx.ticks_to_bars(rows, 5, cfg, now)
    sess, sbars = pick_session(bars, now, cfg)
    if not sess:
        return None, "no trades in a session that has started (latest data %s)" % (latest_day(rows) or "none")
    if not sbars:
        return None, "no trades yet in the %s session of %s" % (sess["family"], sess["day"])
    rng = opening_range(sbars, sess["start"], volume_x)
    if rng is None:
        if psx.ms(now) < first_full(sess["start"]) + 3 * FIVE:
            return None, "opening range still forming (complete at %s)" % psx.hhmm(first_full(sess["start"]) + 3 * FIVE)
        return None, "an opening-range candle is missing (no trades in a slot)"
    trig = rng["trigger"]
    if not trig:
        why = "a missing candle at %s could hide a trigger" % rng["gap_at"] if rng["gap_at"] else "no close above the range high"
        return None, why
    w_from, w_to = entry_window(sess, cfg)
    close_t = trig["t"] + FIVE
    last = sbars[-1]
    ldcp = (quote or {}).get("ldcp") if (quote or {}).get("ldcp") and sess["day"] == latest_day(rows) else None
    vol = sum(b["v"] for b in sbars)
    notes = ["%s session %s" % (sess["family"], sess["day"])]
    in_window = w_from <= close_t <= w_to
    notes.append("inside the entry window (%s-%s)" % (psx.hhmm(w_from), psx.hhmm(w_to)) if in_window
                 else "outside the entry window (%s-%s)" % (psx.hhmm(w_from), psx.hhmm(w_to)))
    if rng["volume_ratio"] is not None:
        notes.append("trigger volume %.2fx the range average" % rng["volume_ratio"])
    return {"symbol": sym, "name": (quote or {}).get("name", sym), "setup": "opening-range breakout",
            "price": last["c"], "change_pct": round((last["c"] / ldcp - 1) * 100, 2) if ldcp else None,
            "volume": vol, "relative_volume": round(rng["volume_ratio"], 2) if rng["volume_ratio"] is not None else None,
            "range": {"high": rng["high"], "low": rng["low"]},
            "trigger": {"time": psx.hhmm(close_t), "close": trig["c"], "volume": trig["v"], "bar": psx.hhmm(trig["t"])},
            "pct_over": round((trig["c"] / rng["high"] - 1) * 100, 2), "in_window": in_window,
            "session_date": sess["day"], "session": sess["family"], "notes": notes}, None


def cmd_orb(args, cfg):
    now = psx.parse_pkt(args.now) if args.now else psx.now_pkt()
    try:
        mw = psx.market_watch(cfg)
    except psx.PsxError as e:
        if not (args.symbols or args.watchlist):
            raise
        mw = None
        print("Note: Market Watch unavailable (%s)." % e, file=sys.stderr)
    syms, by_sym, universe = build_list(args, cfg, mw)
    total = len(syms)
    if args.limit and args.limit > 0:
        syms = syms[:args.limit]
    results, failed, skipped = [], [], []
    data_day = None
    for i, sym in enumerate(syms, 1):
        progress(i, len(syms), sym, args.quiet)
        try:
            rows = psx.ticks(sym, cfg)
        except psx.PsxError as e:
            failed.append({"symbol": sym, "reason": str(e)})
            continue
        if not rows:
            skipped.append({"symbol": sym, "reason": "no trades published"})
            continue
        data_day = max(data_day or "", latest_day(rows))
        t_now = now
        if args.at:
            t_now = psx.parse_pkt("%s %s" % (latest_day(rows), args.at))
        row, why = orb_row(sym, rows, t_now, cfg, args.volume_x, by_sym.get(sym))
        if row:
            results.append(row)
        else:
            skipped.append({"symbol": sym, "reason": why})
    as_of = psx.parse_pkt("%s %s" % (data_day, args.at)) if args.at and data_day else now
    results.sort(key=lambda r: (r["trigger"]["time"], r["symbol"]))
    print("Opening-range breakout scan as of %s; trades from the latest PSX session (%s)."
          % (as_of.strftime("%Y-%m-%d %H:%M PKT"), data_day or "none"))
    print("Scanned %d of %d symbols%s; %d could not be read; %d closed above their opening-range high%s."
          % (len(syms), total, " (the %d most traded)" % len(syms) if len(syms) < total else "", len(failed),
             len(results), " with volume >= %.2fx the range average" % args.volume_x if args.volume_x else ""))
    _print_results(results, "orb", args)
    if len(syms) <= 10:
        for k in skipped:
            print("  %s: %s" % (k["symbol"], k["reason"]))
    for f in failed:
        print("  could not read %s: %s" % (f["symbol"], f["reason"]))
    out = {"as_of": as_of.strftime("%Y-%m-%d %H:%M PKT"), "mode": "orb", "universe": universe, "scanned": len(syms),
           "session_date": data_day, "source": SOURCE + ", 5-minute candles built from trades",
           "results": results, "failed": failed, "no_match": skipped}
    _finish(args, out)
    return 0 if results else 1


def _print_results(results, mode, args):
    if args.json or not results:
        return
    shown = results[:args.show]
    if mode == "daily":
        cols = [("Symbol", "symbol"), ("Close", lambda r: "%.2f" % r["price"]),
                ("Change", lambda r: "%+.2f%%" % r["change_pct"]),
                ("Rel vol", lambda r: "%.2fx" % r["relative_volume"] if r.get("relative_volume") is not None else "-"),
                ("RSI", lambda r: "%.1f" % r["rsi"] if r.get("rsi") is not None else "-"),
                ("Setups", lambda r: ", ".join(r["setups"]))]
    else:
        cols = [("Symbol", "symbol"), ("Trigger", lambda r: r["trigger"]["time"]),
                ("Close", lambda r: "%.2f" % r["trigger"]["close"]),
                ("Range", lambda r: "%.2f-%.2f" % (r["range"]["low"], r["range"]["high"])),
                ("Over", lambda r: "%+.2f%%" % r["pct_over"]),
                ("Window", lambda r: "inside" if r["in_window"] else "outside"),
                ("Now", lambda r: "%.2f" % r["price"]), ("Session", "session")]
    print(psx.table(shown, cols))
    if len(results) > len(shown):
        print("... and %d more (all are in the JSON)." % (len(results) - len(shown)))
    print("A match is a chart that met a rule, not a buy. Re-run before acting: prices move on.")


def _finish(args, out):
    if args.json:
        print(json.dumps(out, indent=2))
    if args.write:
        print("Wrote %s" % psx.write_json(psx.path("scan.json"), out))


def main(argv=None):
    cfg = psx.load_config()
    ap = argparse.ArgumentParser(description="PSX chart scanner (long only, never places orders).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, hlp in (("universe", "liquid symbols from Market Watch"),
                      ("daily", "setups on completed daily candles"),
                      ("orb", "opening-range breakouts in the latest session")):
        p = sub.add_parser(name, help=hlp)
        p.add_argument("--min-price", type=float, default=float(cfg.get("min_price", 5)))
        p.add_argument("--min-volume", type=float, default=float(cfg.get("min_volume", 100000)))
        p.add_argument("--sector", help="sector code or a word in the company name")
        p.add_argument("--index", help="only symbols listed in this index, e.g. KSE100, KSE30, KMI30")
        p.add_argument("--show", type=int, default=40, help="rows to print (all are written)")
        p.add_argument("--json", action="store_true")
        p.add_argument("--write", action="store_true", help="save trader/universe.txt or trader/scan.json")
        if name != "universe":
            g = p.add_mutually_exclusive_group()
            g.add_argument("--symbols", help="comma-separated symbols instead of Market Watch")
            g.add_argument("--watchlist", metavar="FILE", help="scan.json, universe.txt or a list of symbols")
            p.add_argument("--limit", type=int, default=60, help="scan the N most traded (default 60, 0 = all)")
            p.add_argument("--now", help='pretend it is this time, "YYYY-MM-DD HH:MM" Pakistan time')
            p.add_argument("--quiet", action="store_true", help="no progress lines")
        if name == "orb":
            p.add_argument("--at", help="replay the latest session up to HH:MM (Pakistan time)")
            p.add_argument("--volume-x", type=float, default=0.0, help="trigger volume vs the range average")
    args = ap.parse_args(argv)
    return {"universe": cmd_universe, "daily": cmd_daily, "orb": cmd_orb}[args.cmd](args, cfg)


if __name__ == "__main__":
    psx.run(main)
