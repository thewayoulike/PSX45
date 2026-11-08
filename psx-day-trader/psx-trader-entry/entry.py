#!/usr/bin/env python3
"""Entry Timer for psx-trader-entry: watches one PSX setup candle by candle and
says the moment it confirms. Standard library only. Long side only. It never
places an order.

    python3 psx-trader-entry/entry.py check OGDC                     # opening-range breakout
    python3 psx-trader-entry/entry.py check OGDC --write             # also save trader/entry.json
    python3 psx-trader-entry/entry.py check OGDC --setup level:316.50
    python3 psx-trader-entry/entry.py check OGDC --volume-x 1.5 --now "2026-11-06 10:15"
    python3 psx-trader-entry/entry.py watch OGDC --every 30          # polls until triggered or expired

Setups:
  orb          opening-range breakout. The range is the high and low of the first
               three complete 5-minute candles of the session (09:35-09:50
               Monday-Thursday, 09:20-09:35 Friday morning, 14:35-14:50 Friday
               afternoon). It triggers on the first COMPLETED candle after the
               range that CLOSES above the range high.
  level:PRICE  the first completed candle after the range that closes above PRICE,
               having closed at or below it the candle before (a real cross).
  --volume-x X the trigger candle also needs X times the range candles' average volume.

Unfinished candles never confirm. A missing candle (no trades in a 5-minute slot)
before the trigger means no setup: it could hide an earlier trigger. Entries count
only inside the entry window (config entry_window_minutes, default 15-120 minutes
after the session's first full candle, and never after the flat-by time).

Statuses: waiting, triggered, expired, no-setup, closed (PSX is closed and no
session has run today). Exit codes: 0 = triggered, 1 = anything else,
2 = could not run.
"""

import argparse
import datetime
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

FIVE = psx.FIVE_MS
MIN = psx.MINUTE_MS


def first_full(start):
    return -(-start // FIVE) * FIVE


def entry_window(session, cfg):
    a, b = (cfg.get("entry_window_minutes") or [15, 120])[:2]
    first = first_full(session["start"])
    return first + int(a) * MIN, min(first + int(b) * MIN, session["end"] - int(cfg.get("flat_by_minutes", 5)) * MIN)


def parse_setup(text):
    """'orb' -> ('orb', None); 'level:316.5' -> ('level', 316.5)."""
    text = (text or "orb").strip().lower()
    if text == "orb":
        return "orb", None
    if text.startswith("level:"):
        try:
            lvl = float(text.split(":", 1)[1])
        except ValueError:
            lvl = 0
        if lvl > 0:
            return "level", lvl
    raise psx.PsxError("Use --setup orb or --setup level:PRICE (for example level:316.50).")


def choose_session(now, cfg=None):
    """(session, note). The open session; else today's latest session that has started
    (Friday break or after the close); else None (PSX closed today so far)."""
    day = now.strftime("%Y-%m-%d")
    t = psx.ms(now)
    started = [s for s in psx.sessions(day, cfg) if s["start"] <= t]
    if not started:
        return None, None
    s = dict(started[-1], day=day)
    if t < s["end"]:
        return s, None
    later = [x for x in psx.sessions(day, cfg) if x["start"] > t]
    if later:
        nxt = later[0]
        f = first_full(nxt["start"])
        return s, ("The %s session has ended. The %s session opens at %s and builds its own opening range (%s-%s)."
                   % (s["family"], nxt["family"], psx.hhmm(nxt["start"]), psx.hhmm(f), psx.hhmm(f + 3 * FIVE)))
    return s, "PSX has closed for the day. Next open: %s." % psx.market_clock(now, cfg)["next_open"]


def check_entry(bars, session, now, cfg, volume_x=0.0, level=None):
    """Mirror of the PSX Trading Lab's checkEntry on one session's completed 5-minute candles.
    Returns {status, reason, range, trigger, index, level, volume_ratio, window, last}."""
    t_now = psx.ms(now)
    first = first_full(session["start"])
    w_from, w_to = entry_window(session, cfg)
    bars = [b for b in bars if b["t"] + FIVE <= t_now]
    out = {"status": None, "reason": "", "range": None, "trigger": None, "index": -1, "level": level,
           "volume_ratio": None, "window": (w_from, w_to), "last": bars[-1] if bars else None}
    rng = [b for b in bars if not b.get("filled")][:3]
    if len(rng) < 3 or any(b["t"] != first + i * FIVE for i, b in enumerate(rng)):
        if t_now < first + 3 * FIVE or (not bars and t_now < w_to):
            out.update(status="waiting", reason="The opening range is still forming (complete at %s)." % psx.hhmm(first + 3 * FIVE)
                       if t_now < first + 3 * FIVE else "No trades in this session yet.")
        else:
            out.update(status="no-setup", reason="An opening-range candle is missing (no trades in a 5-minute slot), so there is no clean range.")
        return out
    high, low = max(b["h"] for b in rng), min(b["l"] for b in rng)
    avg = sum(b["v"] for b in rng) / 3
    lvl = level if level is not None else high
    out.update(range={"high": high, "low": low, "mid": (high + low) / 2, "start": first, "end": first + 3 * FIVE}, level=lvl)
    for i in range(3, len(bars)):
        b = bars[i]
        if b["t"] + FIVE > w_to:
            break
        if b.get("filled") or b["t"] - bars[i - 1]["t"] != FIVE:
            out.update(status="no-setup", reason="No trades in the %s candle: a missing candle could hide an earlier entry."
                       % psx.hhmm(bars[i - 1]["t"] + FIVE))
            return out
        if b["t"] + FIVE < w_from:
            continue
        ratio = b["v"] / avg if avg else None
        crossed = level is None or bars[i - 1]["c"] <= lvl
        if b["c"] > lvl and crossed and (not volume_x or (ratio is not None and ratio >= volume_x)):
            out.update(status="triggered", trigger=b, index=i, volume_ratio=ratio,
                       reason="A completed candle closed above the level%s." % (" with enough volume" if volume_x else ""))
            return out
    if t_now >= w_to:
        out.update(status="expired", reason="The entry window (%s-%s) ended without a completed close above Rs. %.2f."
                   % (psx.hhmm(w_from), psx.hhmm(w_to), lvl))
    else:
        out.update(status="waiting", reason="Waiting for a completed candle to close above Rs. %.2f." % lvl)
    return out


def evaluate(symbol, rows, now, cfg, setup="orb", level=None, volume_x=0.0):
    """Everything for one check: the entry.json dict (contract shape) plus extras."""
    sym = psx.clean_symbol(symbol)
    data_day = psx.pkt_day(rows[-1][0]) if rows else None
    session, note = choose_session(now, cfg)
    checked = now.strftime("%Y-%m-%d %H:%M PKT")
    base = {"symbol": sym, "setup": setup if setup == "orb" else "level", "status": None, "checked_at": checked,
            "session_date": None, "session": None, "range": None, "trigger": None, "message": "",
            "level": level, "data_date": data_day}
    if session is None:
        clock = psx.market_clock(now, cfg)
        base.update(status="closed", message="PSX is closed now (%s). It opens next on %s. Nothing to check until then%s."
                    % (checked, clock["next_open"], "; the latest published trades are from %s" % data_day if data_day else ""))
        return base
    bars = [b for b in psx.ticks_to_bars(rows, 5, cfg, now) if b["day"] == session["day"] and b["family"] == session["family"]]
    res = check_entry(bars, session, now, cfg, volume_x, level)
    w_from, w_to = res["window"]
    base.update(status=res["status"], session_date=session["day"], session=session["family"],
                session_end=psx.hhmm(session["end"]), window={"from": psx.hhmm(w_from), "to": psx.hhmm(w_to)},
                volume_x=volume_x or None)
    if res["range"]:
        r = res["range"]
        base["range"] = {"high": r["high"], "low": r["low"], "mid": round(r["mid"], 3), "start": psx.hhmm(r["start"]), "end": psx.hhmm(r["end"])}
        base["level"] = res["level"]
    if res["last"]:
        base["last"] = {"bar": psx.hhmm(res["last"]["t"]), "close": res["last"]["c"]}
    lines = []
    if res["status"] == "triggered":
        b = res["trigger"]
        close_t = b["t"] + FIVE
        base["trigger"] = {"time": psx.hhmm(close_t), "close": b["c"], "volume": b["v"], "bar": psx.hhmm(b["t"]), "t": b["t"],
                           "volume_ratio": round(res["volume_ratio"], 2) if res["volume_ratio"] is not None else None}
        what = "the opening-range high" if level is None else "your level"
        lines.append("Triggered at %s at %s: the %s candle closed above %s %s (%+.2f%%)."
                     % (psx.hhmm(close_t), psx.rs(b["c"]), psx.hhmm(b["t"]), what, psx.rs(res["level"]), (b["c"] / res["level"] - 1) * 100))
        age = (psx.ms(now) - close_t) // MIN
        last = res["last"]
        if age > 5 and last:
            lines.append("That was %d minutes ago; the last close is %s (%s candle). A late entry is a different trade."
                         % (age, psx.rs(last["c"]), psx.hhmm(last["t"])))
        lines.append("Nothing was placed. Next: set the stop and target before you buy (psx-trader-exit).")
    elif res["status"] == "waiting":
        last = res["last"]
        if res["range"] and last:
            gap = res["level"] - last["c"]
            lines.append("Waiting: last close %s (%s candle), %s %s the level %s (%+.2f%%)."
                         % (psx.rs(last["c"]), psx.hhmm(last["t"]), psx.rs(abs(gap)), "under" if gap >= 0 else "over",
                            psx.rs(res["level"]), (last["c"] / res["level"] - 1) * 100))
            forming = [p for t, p, v in rows if last["t"] + FIVE <= t <= psx.ms(now)]
            if forming:
                lines.append("The %s candle is still forming (%s so far); it counts only once it closes at %s."
                             % (psx.hhmm(last["t"] + FIVE), psx.rs(forming[-1]), psx.hhmm(last["t"] + 2 * FIVE)))
            if level is not None and last["c"] > res["level"]:
                lines.append("It is already above your level: a trigger needs a close at or below it first, then a close above.")
        else:
            lines.append("Waiting: %s" % res["reason"])
        lines.append("Entries count until %s." % psx.hhmm(w_to))
    else:
        lines.append("%s: %s" % ("Expired" if res["status"] == "expired" else "No setup", res["reason"]))
    if data_day and data_day != session["day"]:
        lines.append("The latest published trades are from %s, not %s (PSX publishes only the latest session)." % (data_day, session["day"]))
    if note:
        lines.append(note)
    base["message"] = " ".join(lines)
    return base


def header(e):
    rng = e.get("range")
    out = ["%s  %s  %s on 5-minute candles built from PSX trades (via your PSX Tracker server, unofficial, can lag)"
           % (e["symbol"], e["checked_at"], "opening-range breakout" if e["setup"] == "orb" else "level %s" % psx.rs(e["level"]))]
    if e.get("session"):
        out.append("Session: %s %s, entry window %s-%s." % (e["session_date"], e["session"], e["window"]["from"], e["window"]["to"]))
    if rng:
        out.append("Opening range %s-%s: high %s, low %s." % (rng["start"], rng["end"], psx.rs(rng["high"]), psx.rs(rng["low"])))
    return "\n".join(out)


def run_check(args, cfg, now):
    setup, level = parse_setup(args.setup)
    return evaluate(args.symbol, psx.ticks(args.symbol, cfg), now, cfg, setup, level, args.volume_x)


def cmd_check(args, cfg):
    now = psx.parse_pkt(args.now) if args.now else psx.now_pkt()
    e = run_check(args, cfg, now)
    print(header(e))
    print("%s  %s" % (e["status"].upper(), e["message"]))
    if args.write:
        print("Wrote %s" % psx.write_json(psx.path("entry.json"), e))
    return 0 if e["status"] == "triggered" else 1


def cmd_watch(args, cfg):
    replay = bool(args.now)
    now = psx.parse_pkt(args.now) if replay else psx.now_pkt()
    every = max(10, int(args.every))
    last_key = None
    first = True
    try:
        while True:
            e = run_check(args, cfg, now)
            if first:
                print(header(e))
                first = False
            # One line per completed candle (or change of status), not one per poll.
            key = (e["status"], (e.get("last") or {}).get("bar"))
            if key != last_key:
                print("%s %s  %s" % (now.strftime("%H:%M"), e["status"].upper(), e["message"]), flush=True)
                last_key = key
            if e["status"] == "closed":
                return 1
            end = psx.parse_pkt("%s %s" % (e["session_date"], e["session_end"]))
            if now >= end:
                # Never watch a session that is over: an old trigger is not an entry now.
                print("The %s session has ended; nothing to watch. PSX opens next on %s."
                      % (e["session"], psx.market_clock(now, cfg)["next_open"]))
                return 1
            if e["status"] == "triggered":
                print("Wrote %s" % psx.write_json(psx.path("entry.json"), e))
                return 0
            if e["status"] in ("expired", "no-setup"):
                return 1
            if replay:
                now = now + datetime.timedelta(seconds=every)
            else:
                time.sleep(every)
                now = psx.now_pkt()
    except KeyboardInterrupt:
        print("\nStopped watching %s. Nothing was placed." % args.symbol.upper())
        return 1


def main(argv=None):
    cfg = psx.load_config()
    ap = argparse.ArgumentParser(description="PSX entry timer (long only, never places orders).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("check", "watch"):
        p = sub.add_parser(name)
        p.add_argument("symbol")
        p.add_argument("--setup", default="orb", help="orb (default) or level:PRICE")
        p.add_argument("--volume-x", type=float, default=0.0, help="trigger volume vs the opening-range average")
        p.add_argument("--now", help='replay as of "YYYY-MM-DD HH:MM" Pakistan time (latest session only)')
        if name == "check":
            p.add_argument("--write", action="store_true", help="save trader/entry.json")
        else:
            p.add_argument("--every", type=int, default=30, help="seconds between checks (default 30)")
    args = ap.parse_args(argv)
    return cmd_check(args, cfg) if args.cmd == "check" else cmd_watch(args, cfg)


if __name__ == "__main__":
    psx.run(main)
