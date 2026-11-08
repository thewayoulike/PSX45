#!/usr/bin/env python3
"""Exit Planner for psx-trader-exit: sets the stop and the target before you buy,
checks them against PSX price steps, the daily price band and trading charges,
and writes trader/plan.json. Standard library only. Long side only. It never
places an order.

    python3 psx-trader-exit/exit.py plan                         # from trader/entry.json: or-mid stop, 2R target
    python3 psx-trader-exit/exit.py plan --stop or-low --target 1R --write
    python3 psx-trader-exit/exit.py plan --stop atr:1.5
    python3 psx-trader-exit/exit.py plan --symbol OGDC --entry 315.01 --stop pct:1
    python3 psx-trader-exit/exit.py show                         # the current trader/plan.json

Stops: or-mid (default; opening-range midpoint), or-low, atr:K (K x the 14-candle
ATR of 5-minute candles up to the entry candle), pct:X (X%% under the entry),
price:X. Rounded DOWN to the paisa (Rs 0.01).
Targets: 2R (default), 1R, 1.5R..., price:X. Rounded down, then capped at the
lowest of: the R benchmark, one paisa below the nearest resistance above the
entry (yesterday's high and swing highs of the last 60 daily candles and of
today's candles through the entry), the typical-daily-range ceiling (today's
low so far + the median daily range of up to 20 earlier days), and the upper
price limit. The cap that binds is named.

Refused, with the reason: a stop at or above the entry, a target at or below it,
a stop closer than two price steps or the round-trip cost a share, an entry
outside the price band, an entry at or after the flat-by time.
Exit codes: 0 = plan made, 1 = refused or skip (target does not cover costs),
2 = could not run.
"""

import argparse
import datetime
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

FIVE = psx.FIVE_MS
MIN = psx.MINUTE_MS
TICK = psx.PRICE_TICK
SKIP = "Skip — target does not cover costs"
STOP_TOO_CLOSE = "Stop is too close to the entry"


class Refused(psx.PsxError):
    """The plan breaks a rule; say why and do not write it."""


def floor_tick(x):
    return math.floor((x + 1e-9) * 100) / 100


def first_full(start):
    return -(-start // FIVE) * FIVE


def median(xs):
    s = sorted(xs)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


def min_stop_distance(entry, stop, fee_pct, slip_pct, one_side=False):
    """Two price steps, or what a round trip costs a share (engine.ts minimumStopDistance)."""
    round_trip = (psx.buy_cost(entry, fee_pct, slip_pct) - entry) + (stop - psx.sell_proceeds(stop, fee_pct, slip_pct, one_side))
    return max(2 * TICK, round_trip)


def atr_5m(bars, period=14):
    """ATR of 5-minute candles; the jump between two days is not counted as a candle's range.
    Returns (value or None, number of ranges used)."""
    vals = []
    for p, b in zip(bars, bars[1:]):
        if b["day"] == p["day"]:
            vals.append(max(b["h"] - b["l"], abs(b["h"] - p["c"]), abs(b["l"] - p["c"])))
        else:
            vals.append(b["h"] - b["l"])
    vals = vals[-period:]
    return (sum(vals) / len(vals) if vals else None), len(vals)


def assess_target(entry, requested, day, daily, known, ref_close=None):
    """Mirror of targets.ts assessTarget. daily: daily candles; known: today's 5-minute candles
    through the entry. Returns the capped target, the reason, and the facts behind it."""
    warnings = []
    prior = [b for b in daily if psx.pkt_day(b["t"]) < day][-60:]
    previous = prior[-1] if prior else None
    sample = prior[-20:]
    recent = bool(previous) and (datetime.date.fromisoformat(day) - datetime.date.fromisoformat(psx.pkt_day(previous["t"]))).days <= 7
    # PSX's own previous close (Market Watch LDCP) already allows for an ex-dividend / bonus / rights
    # adjustment; the raw daily candle does not. Prefer it when it is for this session.
    base = ref_close if ref_close else (previous["c"] if previous else None)
    if ref_close and previous and abs(ref_close - previous["c"]) > 0.005:
        warnings.append("PSX's previous close is %.2f, not the daily candle's %.2f (likely an ex-dividend, bonus or rights "
                        "adjustment): limits use %.2f." % (ref_close, previous["c"], ref_close))
    candidates = [(floor_tick(requested), "R benchmark")]
    highs = [previous["h"]] if previous else []
    for series in (prior, known):
        for i in range(2, len(series) - 2):
            h = series[i]["h"]
            if all(b["h"] < h for b in series[i - 2:i]) and all(b["h"] <= h for b in series[i + 1:i + 3]):
                highs.append(h)
    above = sorted(h for h in highs if h > entry + 0.005)
    resistance = above[0] if above else None
    if resistance is not None:
        candidates.append((floor_tick(resistance - 0.01), "nearby resistance (one paisa below %.2f)" % resistance))
    typical_pct = median([(b["h"] - b["l"]) / b["c"] * 100 for b in sample]) if len(sample) >= 10 and recent else None
    ceiling = None
    if typical_pct is not None and known:
        ceiling = floor_tick(min(b["l"] for b in known) + base * typical_pct / 100)
        candidates.append((ceiling, "typical daily range (today's low %.2f + %.2f%% of %.2f)"
                           % (min(b["l"] for b in known), typical_pct, base)))
    else:
        warnings.append("Typical daily movement not checked: it needs 10 recent daily candles and today's candles up to the entry.")
    band = psx.price_band(base) if base and (ref_close or recent) else None
    if band:
        candidates.append((floor_tick(band["upper"]), "estimated upper price limit"))
        warnings.append("The price band is an estimate (10%% or Rs. 1 from the prior close %.2f). Check the PSX company page "
                        "for special bands and ex-dates." % base)
    else:
        warnings.append("No recent prior close: the daily price limit is unverified.")
    if not prior:
        warnings.append("No resistance history: the R benchmark alone is not a price forecast.")
    price, reason = min(candidates, key=lambda c: c[0])
    target = price
    if band and (entry < band["lower"] - 0.005 or entry > band["upper"] + 0.005):
        target, reason = None, "the entry is outside the estimated price band %.2f-%.2f" % (band["lower"], band["upper"])
    elif not price > entry:
        target, reason = None, "no room left above the entry: %s" % reason
    return {"target": target, "reason": reason, "requested": floor_tick(requested), "resistance": resistance,
            "typical_ceiling": ceiling, "typical_range_pct": round(typical_pct, 3) if typical_pct is not None else None,
            "sample": len(sample), "band": band, "warnings": warnings}


def parse_rule(text, kinds):
    text = (text or "").strip().lower()
    if text in kinds:
        return text, None
    for k in kinds:
        if k.endswith(":") and text.startswith(k):
            try:
                v = float(text[len(k):])
            except ValueError:
                break
            if v > 0:
                return k[:-1], v
    if "r" in kinds and text.endswith("r"):
        try:
            v = float(text[:-1])
        except ValueError:
            v = 0
        if 0 < v <= 10:
            return "r", v
    raise psx.PsxError("Could not read %r. Use one of: %s." % (text, ", ".join(k + ("X" if k.endswith(":") else "") for k in kinds if k != "r") + (", 2R" if "r" in kinds else "")))


def compute_stop(rule, value, entry, rng, bars_through):
    """(stop rounded down, stop_rule, explanation)."""
    if rule in ("or-mid", "or-low"):
        if not rng:
            raise Refused("This stop needs the opening range, and there is none for this session. Name a stop: --stop pct:1, price:X or atr:1.5.")
        if rule == "or-mid":
            raw = (rng["high"] + rng["low"]) / 2
            why = "opening-range midpoint: (%.2f + %.2f) / 2 = %s, rounded down" % (rng["high"], rng["low"], ("%.3f" % raw).rstrip("0").rstrip("."))
        else:
            raw = rng["low"]
            why = "opening-range low"
    elif rule == "atr":
        val, n = atr_5m(bars_through)
        if val is None or n < 14:
            raise Refused("An ATR stop needs 14 earlier 5-minute candles up to the entry; only %d are known. "
                          "PSX publishes only the latest session's trades." % n)
        raw = entry - value * val
        why = "%g x ATR %.3f (14 five-minute candles up to the entry) under the entry" % (value, val)
    elif rule == "pct":
        raw = entry * (1 - value / 100)
        why = "%g%% under the entry" % value
    else:
        raw, why = value, "your price"
        rule = "manual"
    return floor_tick(raw), rule, why


def make_plan(symbol, entry, session, entry_ms, rng, stop_spec, target_spec, daily, intraday, cfg):
    """Build the plan dict, or raise Refused. intraday: today's 5-minute candles (all sessions)."""
    entry = round(entry, 2)
    if entry <= 0:
        raise Refused("The entry must be above zero.")
    day = session["day"]
    known = [b for b in intraday if b["day"] == day and b["t"] + FIVE <= entry_ms]
    s_rule, s_val = parse_rule(stop_spec, ["or-mid", "or-low", "atr:", "pct:", "price:"])
    t_rule, t_val = parse_rule(target_spec, ["r", "price:"])
    atr_bars = [b for b in intraday if b["t"] + FIVE <= entry_ms]
    stop, stop_rule, stop_why = compute_stop(s_rule, s_val, entry, rng, atr_bars)
    if stop <= 0 or stop >= entry:
        raise Refused("The stop %s is not below the entry %s. For a long trade the stop goes under the entry." % (psx.rs(stop), psx.rs(entry)))
    fee, slip, one = float(cfg.get("fee_pct", 0.15)), float(cfg.get("slip_pct", 0.05)), bool(cfg.get("one_side_commission"))
    need = min_stop_distance(entry, stop, fee, slip, one)
    if entry - stop < need - 1e-9:
        raise Refused("%s: it is %s under the entry, and at least %s is needed (two price steps or the round-trip cost a share, "
                      "whichever is larger). Use a wider stop." % (STOP_TOO_CLOSE, psx.rs(entry - stop), psx.rs(need)))
    risk = round(entry - stop, 2)
    if t_rule == "r":
        requested = round(entry + risk * t_val + 1e-9, 2)
        target_rule = "%gR" % t_val
    else:
        requested = t_val
        target_rule = "price"
    if requested <= entry:
        raise Refused("The target %s is not above the entry %s." % (psx.rs(requested), psx.rs(entry)))
    review = assess_target(entry, requested, day, daily, known, cfg.get("_ref_close"))
    if review["target"] is None:
        raise Refused("No usable target: %s." % review["reason"])
    target = review["target"]
    flat_ms = session["end"] - int(cfg.get("flat_by_minutes", 5)) * MIN
    if entry_ms >= flat_ms:
        raise Refused("The entry at %s is at or after the flat-by time %s for the %s session." % (psx.hhmm(entry_ms), psx.hhmm(flat_ms), session["family"]))
    net_reward = psx.net_per_share(entry, target, fee, slip, one)
    net_risk = -psx.net_per_share(entry, stop, fee, slip, one)
    band = review["band"]
    warnings = []
    if band and entry >= band["upper"] - 2 * TICK:
        warnings.append("The entry is within two price steps of the upper limit %s: buy orders may queue there and not fill." % psx.rs(band["upper"]))
    if band and stop < band["lower"]:
        warnings.append("The stop is below the lower limit %s and cannot fill there in this session." % psx.rs(band["lower"]))
    elif band and stop <= band["lower"] + 2 * TICK:
        warnings.append("The stop is at or near the lower limit %s: if the stock locks there, the stop may not fill." % psx.rs(band["lower"]))
    if band:
        gap = psx.buy_cost(entry, fee, slip) - psx.sell_proceeds(band["lower"], fee, slip, one)
        if gap > 2 * net_risk:
            warnings.append("Gap risk: a stop is a plan, not a guarantee. A fall to the lower limit %s would lose %s a share after charges, "
                            "over twice the planned %s." % (psx.rs(band["lower"]), psx.rs(gap), psx.rs(net_risk)))
    warnings += review["warnings"]
    min_rr = float(cfg.get("min_reward_risk", 1.5))
    net_rr = net_reward / net_risk if net_risk > 0 else 0.0
    skip = SKIP if net_reward <= 1e-9 else None
    if not skip and net_rr < min_rr:
        warnings.append("Reward:risk after charges is %.2f, under your minimum %.2f (psx-trader-risk will block it)." % (net_rr, min_rr))
    if review["reason"] != "R benchmark":
        warnings.append("The %s target %s was cut to %s by the %s." % (target_rule, psx.rs(review["requested"]), psx.rs(target), review["reason"]))
    return {
        "symbol": symbol, "side": "buy", "session_date": day, "session": session["family"], "entry": entry,
        "entry_time": psx.hhmm(entry_ms), "stop": stop, "target": target, "risk_per_share": risk,
        "target_r": round((target - entry) / risk, 2), "stop_rule": stop_rule, "stop_detail": stop_why,
        "target_rule": target_rule, "target_requested": review["requested"], "target_bound_by": review["reason"],
        "resistance": review["resistance"], "typical_ceiling": review["typical_ceiling"],
        "typical_range_pct": review["typical_range_pct"], "flat_by": psx.hhmm(flat_ms),
        "band": band, "net_reward_per_share": round(net_reward, 4), "net_risk_per_share": round(net_risk, 4),
        "net_rr": round(net_rr, 2), "skip": skip, "range": rng, "warnings": warnings,
        "created_at": psx.now_pkt().strftime("%Y-%m-%d %H:%M PKT"),
        "costs": {"fee_pct": fee, "slip_pct": slip, "one_side_commission": one},
    }


def session_at(now, cfg):
    """The open session, else today's next one, else the next trading day's first."""
    t = psx.ms(now)
    probe = now
    for _ in range(15):
        day = probe.strftime("%Y-%m-%d")
        for s in psx.sessions(day, cfg):
            if s["end"] > t:
                return dict(s, day=day)
        probe = (probe + datetime.timedelta(days=1)).replace(hour=0, minute=0)
    raise psx.PsxError("No PSX session found in the next two weeks.")


def range_from_bars(bars, session):
    first = first_full(session["start"])
    rng = [b for b in bars if b["day"] == session["day"] and b["family"] == session["family"]][:3]
    if len(rng) != 3 or any(b["t"] != first + i * FIVE for i, b in enumerate(rng)):
        return None
    hi, lo = max(b["h"] for b in rng), min(b["l"] for b in rng)
    return {"high": hi, "low": lo, "mid": round((hi + lo) / 2, 3), "start": psx.hhmm(first), "end": psx.hhmm(first + 3 * FIVE)}


def gather(args, cfg, now):
    """Entry facts from trader/entry.json and/or the flags."""
    e = None if args.no_entry_file else psx.read_json(psx.path("entry.json"), "entry", required=False)
    raw = args.symbol or (e or {}).get("symbol")
    if not raw:
        raise psx.PsxError("No trader/entry.json yet. Run psx-trader-entry first, or give --symbol S --entry PRICE.")
    symbol = psx.clean_symbol(raw)
    if e and e.get("symbol") != symbol:
        e = None
    session, entry, entry_ms, rng = None, args.entry, None, None
    if e and e.get("session_date") and e.get("session"):
        sess = next((s for s in psx.sessions(e["session_date"], cfg) if s["family"] == e["session"]), None)
        if sess:
            session = dict(sess, day=e["session_date"])
        rng = e.get("range")
    if entry is None:
        if not e or e.get("status") != "triggered" or not e.get("trigger"):
            raise psx.PsxError("trader/entry.json for %s has not triggered (status: %s). Give --entry PRICE to plan ahead."
                               % (symbol, (e or {}).get("status", "none")))
        entry = float(e["trigger"]["close"])
        trig = e["trigger"]
        entry_ms = trig.get("t", psx.ms(psx.parse_pkt("%s %s" % (e["session_date"], trig["bar"])))) + FIVE
    if session is None:
        session = session_at(now, cfg)
    if entry_ms is None:
        entry_ms = max(psx.ms(now), first_full(session["start"]) + 3 * FIVE)
    return symbol, float(entry), session, entry_ms, rng


def cmd_plan(args, cfg):
    now = psx.parse_pkt(args.now) if args.now else psx.now_pkt()
    symbol, entry, session, entry_ms, rng = gather(args, cfg, now)
    notes = []
    try:
        daily = psx.daily_bars(symbol, cfg)
    except psx.PsxError as ex:
        daily = []
        notes.append("Daily candles unavailable (%s): the target is not checked against resistance or typical range." % ex)
    try:
        intraday = [b for b in psx.ticks_to_bars(psx.ticks(symbol, cfg), 5, cfg, now) if b["day"] == session["day"]]
    except psx.PsxError as ex:
        intraday = []
        notes.append("Today's trades unavailable (%s)." % ex)
    if not rng and args.stop in ("or-mid", "or-low"):
        rng = range_from_bars(intraday, session)
    # Market Watch describes the latest session, which is the one the trades come from.
    if intraday:
        try:
            row = psx.quotes([symbol], cfg).get(symbol)
            if row and row.get("ldcp"):
                cfg = dict(cfg, _ref_close=float(row["ldcp"]))
        except psx.PsxError:
            pass
    try:
        plan = make_plan(symbol, entry, session, entry_ms, rng, args.stop, args.target, daily, intraday, cfg)
    except Refused as ex:
        print("Refused: %s" % ex)
        print("Nothing was written. Never loosen a rule just to make a plan pass.")
        return 1
    plan["warnings"] = notes + plan["warnings"]
    print_plan(plan)
    if args.write:
        print("Wrote %s" % psx.write_json(psx.path("plan.json"), plan))
    return 1 if plan["skip"] else 0


def print_plan(p):
    b = p.get("band")
    print("Exit plan: %s long, %s %s (5-minute candles from PSX trades via your PSX Tracker server)" % (p["symbol"], p["session_date"], p["session"]))
    print("  Entry          %s at %s" % (psx.rs(p["entry"]), p["entry_time"]))
    print("  Stop           %s  %s" % (psx.rs(p["stop"]), p["stop_detail"]))
    print("  Target         %s  %s, bound by the %s" % (psx.rs(p["target"]), p["target_rule"], p["target_bound_by"]))
    print("  Risk a share   %s (%.2f%% of the entry); target is %.2fR" % (psx.rs(p["risk_per_share"]), p["risk_per_share"] / p["entry"] * 100, p["target_r"]))
    print("  After charges  reward %s, risk %s a share, reward:risk %.2f (fee %.2f%%, slippage %.2f%% each side)"
          % (psx.rs(p["net_reward_per_share"]), psx.rs(p["net_risk_per_share"]), p["net_rr"], p["costs"]["fee_pct"], p["costs"]["slip_pct"]))
    print("  Flat by        %s, win or lose: no overnight hold" % p["flat_by"])
    if b:
        print("  Price band     %s to %s (%s)" % (psx.rs(b["lower"]), psx.rs(b["upper"]), b["basis"]))
    if p["skip"]:
        print("  %s" % p["skip"].replace("—", "-"))
    for w in p["warnings"]:
        print("  - %s" % w)
    print("A stop is a plan, not a guarantee. Nothing was placed.")


def cmd_show(args, cfg):
    print_plan(psx.read_json(psx.path("plan.json"), "plan (run exit.py plan --write first)"))
    return 0


def main(argv=None):
    cfg = psx.load_config()
    ap = argparse.ArgumentParser(description="PSX exit planner (long only, never places orders).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan", help="stop, target and flat-by time for one long trade")
    p.add_argument("--stop", default="or-mid", help="or-mid (default), or-low, atr:K, pct:X, price:X")
    p.add_argument("--target", default="2R", help="2R (default), 1R, 1.5R, price:X")
    p.add_argument("--entry", type=float, help="entry price (plan ahead, or override entry.json)")
    p.add_argument("--symbol", help="symbol, when not using trader/entry.json")
    p.add_argument("--no-entry-file", action="store_true", help="ignore trader/entry.json")
    p.add_argument("--now", help='pretend it is "YYYY-MM-DD HH:MM" Pakistan time')
    p.add_argument("--write", action="store_true", help="save trader/plan.json")
    sub.add_parser("show", help="print trader/plan.json")
    args = ap.parse_args(argv)
    return cmd_plan(args, cfg) if args.cmd == "plan" else cmd_show(args, cfg)


if __name__ == "__main__":
    psx.run(main)
