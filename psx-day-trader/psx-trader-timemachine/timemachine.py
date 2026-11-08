#!/usr/bin/env python3
"""Time Machine for psx-trader-timemachine. Standard library only.

Replays a planned PSX day trade before you risk a rupee: thousands of simulated
runs of the rest of the session from your entry, plus the same opening-range
rule on every earlier session you recorded.

    python3 psx-trader-timemachine/timemachine.py record OGDC,HUBC   # after each close
    python3 psx-trader-timemachine/timemachine.py run                 # trader/plan.json, 10,000 paths, seed 19
    python3 psx-trader-timemachine/timemachine.py run --write         # also save trader/timemachine.json
    python3 psx-trader-timemachine/timemachine.py run --daily         # swing view from daily candles

Why `record`: PSX publishes intraday trades for the LATEST session only. Past
5-minute candles exist only if you saved them, one session a day, with
`record`. They go to trader/bars/SYMBOL/DATE.json.

How a replay works (same method as upstream's sim.py and the PSX Trading Lab):
  1. The pool: earlier COMPLETE sessions of the same kind (Monday-Thursday,
     Friday morning or Friday afternoon), never the plan's own day. Every
     candle becomes four ratios to the candle before it: open, high, low,
     close over the previous close.
  2. One replay starts at the entry price after the entry candle. For each
     candle left up to flat-by it picks a slot at the same time of day
     (+- jitter slots), one past candle from it at random, and scales it to
     the current price. Prices are kept inside the day's price band.
  3. Each candle: stop first (a gap below the stop fills at the worse open),
     then the target. A candle locked at the lower limit cannot fill a stop.
     Still open at flat-by: sold at the last close.
  4. R = net rupees per share after PSX charges and slippage / (entry - stop).
"""
import argparse
import json
import math
import os
import random
import re
import statistics
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

FIVE = psx.FIVE_MS
MINUTE = psx.MINUTE_MS
UPSTREAM_MIN_SESSIONS = 20
OPENING_CANDLES = 3          # 15-minute opening range
COIN_FLIP = 0.05
STRONG = 0.15
MANY_NEITHER = 0.40


# ---------------------------------------------------------------- small helpers

def clock_minutes(text, what="time"):
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*$", str(text or ""))
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        raise psx.PsxError("%s wants a Pakistan time like 10:15 or 15:25, not %r." % (what, text))
    return int(m.group(1)) * 60 + int(m.group(2))


def at_clock(day, minutes):
    return psx.ms(psx.parse_pkt(day)) + minutes * MINUTE


def pct(sorted_values, q):
    return sorted_values[min(len(sorted_values) - 1, int(q * len(sorted_values)))]


def locked_at(bar, limit):
    """A candle that traded only at the limit price: the stock is locked there."""
    return bar["h"] - bar["l"] < psx.PRICE_TICK / 2 and abs(bar["c"] - limit) < psx.PRICE_TICK / 2 + 1e-9


def walk(bars, stop, target, band=None):
    """engine.ts walkTrade: stop before target on an ambiguous candle, a gap through
    the stop exits at the worse open, no stop fill while locked at the lower limit."""
    for b in bars:
        if band and locked_at(b, band["lower"]):
            continue
        if b["o"] <= stop:
            return "stop", b["o"]
        if b["l"] <= stop:
            return "stop", stop
        if b["h"] >= target:
            return "target", target
    if not bars:
        return "close", None
    last = bars[-1]
    if band and locked_at(last, band["lower"]):
        return "locked", last["c"]
    return "close", last["c"]


def clamp_bar(o, h, l, c, band):
    if not band:
        return {"o": o, "h": h, "l": l, "c": c}
    lo, up = band["lower"], band["upper"]
    f = lambda x: min(up, max(lo, x))  # noqa: E731
    return {"o": f(o), "h": f(h), "l": f(l), "c": f(c)}


def costs(cfg):
    return float(cfg.get("fee_pct") or 0), float(cfg.get("slip_pct") or 0), bool(cfg.get("one_side_commission"))


# ---------------------------------------------------------------- sessions

def session_layout(day, family, cfg=None):
    """(window, first candle time, number of 5-minute slots) for a session family on a day."""
    for s in psx.sessions(day, cfg):
        if s["family"] == family:
            first = -(-s["start"] // FIVE) * FIVE
            return s, first, (s["end"] - first) // FIVE
    return None, None, 0


def load_sessions(symbol, cfg=None, now=None, use_latest=True):
    """Recorded candles plus the latest session's trades, grouped into sessions.
    Returns (segments, notes)."""
    notes = []
    merged = {}
    for b in psx.recorded_bars(symbol):
        try:
            merged[int(b["t"])] = dict(b, t=int(b["t"]))
        except (KeyError, TypeError, ValueError):
            continue
    if use_latest:
        try:
            for b in psx.ticks_to_bars(psx.ticks(symbol, cfg), 5, cfg, now):
                merged[b["t"]] = b
        except psx.PsxError as e:
            notes.append("Latest session not loaded (%s). Using recorded sessions only." % e)
    bars = [merged[t] for t in sorted(merged)]
    return psx.segments(bars, 5, cfg, now), notes


def comparable(segs, family, before_day, slots):
    return [s for s in segs if s["complete"] and s["family"] == family and s["day"] < before_day
            and len(s["bars"]) == slots]


def prior_close(segs, day):
    earlier = [s for s in segs if s["day"] < day and s["bars"]]
    return earlier[-1]["bars"][-1]["c"] if earlier else None


# ---------------------------------------------------------------- the plan

def load_plan(a, cfg):
    plan = psx.read_json(a.plan, "plan (run psx-trader-exit first)")
    if not isinstance(plan, dict):
        raise psx.PsxError("%s is not a plan." % a.plan)
    sym = psx.clean_symbol(a.symbol or plan.get("symbol"))
    if str(plan.get("side") or "buy").lower() != "buy":
        raise psx.PsxError("Long only: the plan must be a buy.")
    try:
        entry, stop, target = (float(a.__dict__.get(k) or plan.get(k)) for k in ("entry", "stop", "target"))
    except (TypeError, ValueError):
        raise psx.PsxError("The plan needs numbers for entry, stop and target.")
    if not 0 < stop < entry < target:
        raise psx.PsxError("A buy needs stop < entry < target (got stop %.2f, entry %.2f, target %.2f)." % (stop, entry, target))
    day = a.date or plan.get("session_date") or psx.now_pkt().strftime("%Y-%m-%d")
    psx.parse_pkt(day)
    if not psx.sessions(day, cfg):
        raise psx.PsxError("%s is not a PSX trading day (weekend or holiday)." % day)
    entry_time = a.entry_time or plan.get("entry_time")
    if not entry_time:
        ej = psx.read_json(psx.path("entry.json"), "entry", required=False) or {}
        trig = ej.get("trigger") or {}
        if ej.get("symbol") == sym and ej.get("session_date") == day and trig.get("time"):
            entry_time = "%02d:%02d" % divmod(clock_minutes(trig["time"], "trigger time") + 5, 60)
    band = plan.get("band") if isinstance(plan.get("band"), dict) and plan["band"].get("lower") else None
    return {"symbol": sym, "session_date": day, "entry": entry, "stop": stop, "target": target,
            "entry_time": entry_time, "flat_by": a.flat_by or plan.get("flat_by"),
            "stop_rule": plan.get("stop_rule") or "pct",
            "target_r": float(plan.get("target_r") or (target - entry) / (entry - stop)),
            "band": band}


def place_plan(plan, cfg):
    """Which session, which candle the entry closes on (k), the last candle before flat-by."""
    day = plan["session_date"]
    wins = psx.sessions(day, cfg)
    win = None
    t_entry = at_clock(day, clock_minutes(plan["entry_time"], "entry time")) if plan.get("entry_time") else None
    t_flat = at_clock(day, clock_minutes(plan["flat_by"], "flat_by")) if plan.get("flat_by") else None
    for probe in (t_entry, t_flat):
        if probe is not None and win is None:
            win = next((s for s in wins if s["start"] <= probe <= s["end"]), None)
    if win is None:
        if t_entry is not None:
            raise psx.PsxError("The entry time %s is outside PSX's sessions on %s." % (plan["entry_time"], day))
        win = wins[0]
    _, first, slots = session_layout(day, win["family"], cfg)
    if t_entry is None:
        k = OPENING_CANDLES - 1              # entry at the close of the opening range
        note = "No entry time in the plan: the replay starts at the end of the opening range (%s)." % psx.hhmm(first + OPENING_CANDLES * FIVE)
    else:
        if (t_entry - first) % FIVE:
            raise psx.PsxError("The entry time %s is not on the 5-minute grid." % plan["entry_time"])
        k = (t_entry - first) // FIVE - 1
        note = None
    default_flat = win["end"] - int(cfg.get("flat_by_minutes") or 0) * MINUTE
    if t_flat is None or not (win["start"] < t_flat <= win["end"]):
        t_flat = default_flat
    last = min(slots - 1, (t_flat - first) // FIVE - 1)
    if k < 0 or last <= k:
        raise psx.PsxError("Nothing to replay: the entry at %s leaves no candle before flat-by %s." % (psx.hhmm(first + (k + 1) * FIVE), psx.hhmm(t_flat)))
    return {"family": win["family"], "first": first, "slots": slots, "k": k, "last": last,
            "entry_at": psx.hhmm(first + (k + 1) * FIVE), "flat_by": psx.hhmm(first + (last + 1) * FIVE), "note": note}


def plan_qty(symbol):
    doc = psx.read_json(psx.path("orders.json"), "orders", required=False) or {}
    for o in doc.get("orders") or []:
        if str(o.get("symbol", "")).upper() == symbol and o.get("qty"):
            return int(o["qty"])
    return None


# ---------------------------------------------------------------- Monte Carlo

def build_pool(pool_sessions, slots):
    pool = [[] for _ in range(slots)]
    for s in pool_sessions:
        bars = s["bars"]
        for i in range(1, slots):
            pc = bars[i - 1]["c"]
            pool[i].append((bars[i]["o"] / pc, bars[i]["h"] / pc, bars[i]["l"] / pc, bars[i]["c"] / pc))
    return pool


def simulate(pool, slots, k, last, entry, stop, target, cfg, band=None, paths=10000, seed=19, jitter=2, qty=None):
    fee, slip, one = costs(cfg)
    risk = entry - stop
    rng = random.Random(seed)
    counts = {"target": 0, "stop": 0, "close": 0, "locked": 0}
    rs, rupees = [], []
    for _ in range(paths):
        price = entry
        outcome, exit_ = None, None
        bar = None
        for i in range(k + 1, last + 1):
            j = i if jitter == 0 else min(slots - 1, max(1, i + rng.randint(-jitter, jitter)))
            o, h, l, c = rng.choice(pool[j])
            bar = clamp_bar(price * o, price * h, price * l, price * c, band)
            price = bar["c"]
            if band and locked_at(bar, band["lower"]):
                continue
            if bar["o"] <= stop:
                outcome, exit_ = "stop", bar["o"]
            elif bar["l"] <= stop:
                outcome, exit_ = "stop", stop
            elif bar["h"] >= target:
                outcome, exit_ = "target", target
            if outcome:
                break
        if outcome is None:
            outcome = "locked" if band and bar and locked_at(bar, band["lower"]) else "close"
            exit_ = price
        counts[outcome] += 1
        net = psx.net_per_share(entry, exit_, fee, slip, one)
        rs.append(net / risk)
        rupees.append(net * (qty or 1))
    rs_sorted, rupees_sorted = sorted(rs), sorted(rupees)
    return {
        "paths": paths, "seed": seed, "jitter": jitter, "candles": last - k,
        "p_target": round(counts["target"] / paths, 4), "p_stop": round(counts["stop"] / paths, 4),
        "p_open_at_flat_by": round(counts["close"] / paths, 4), "p_locked": round(counts["locked"] / paths, 4),
        "counts": counts,
        "avg_net_r": round(statistics.mean(rs), 3), "median_net_r": round(pct(rs_sorted, 0.5), 3),
        "rupees_basis": "%d shares" % qty if qty else "per share",
        "p10": round(pct(rupees_sorted, 0.10), 2), "p50": round(pct(rupees_sorted, 0.50), 2),
        "p90": round(pct(rupees_sorted, 0.90), 2),
        "r_at_target": round((target - entry) / risk, 2),
        "net_target_r": round(psx.net_per_share(entry, target, fee, slip, one) / risk, 3),
        "net_stop_r": round(-psx.net_per_share(entry, stop, fee, slip, one) / risk, 3),
    }


def verdict(mc):
    pt, ps = mc["p_target"], mc["p_stop"]
    if pt + ps <= 0:
        return "No replay reached the target or the stop by flat-by: the price at flat-by decides every one."
    r = mc["r_at_target"] or 1.0
    win, loss = mc.get("net_target_r"), mc.get("net_stop_r")
    if win is not None and loss is not None and win > 0 and loss > 0:
        # PSX charges and slippage shift break-even: weigh the net win against the net loss
        r = round(win / loss, 2)
    share, even = pt / (pt + ps), 1.0 / (1.0 + r)
    d = share - even
    one_r = abs(r - 1.0) < 0.005
    if abs(d) < COIN_FLIP:
        head = "Close to a coin flip" if one_r else "Close to break-even"
    elif abs(d) < STRONG:
        head = "Leans toward the target" if d > 0 else "Leans toward the stop"
    else:
        head = "Strongly toward the target" if d > 0 else "Strongly toward the stop"
    odds = "target first %.1f%% vs stop first %.1f%%" % (100 * pt, 100 * ps)
    if one_r:
        return "%s: %s." % (head, odds)
    return ("%s: after charges a win pays %.2f times a loss, so the target has to come first in %.0f%% of the "
            "replays that hit one side to break even; it did in %.0f%% (%s)." % (head, r, 100 * even, 100 * share, odds))


def verdict_notes(mc):
    notes = []
    if mc["p_open_at_flat_by"] > MANY_NEITHER:
        notes.append("%.1f%% of the replays were still open at flat-by; the price then decides those." % (100 * mc["p_open_at_flat_by"]))
    if mc["avg_net_r"] < 0 and mc["p_target"] > mc["p_stop"]:
        notes.append("Average net R is %+.3f all the same: charges and the open trades pull it below zero." % mc["avg_net_r"])
    return notes


# ---------------------------------------------------------------- history (the rule on real sessions)

def rule_stop(rule, hi, lo, entry, stop_pct):
    if rule == "or-low":
        s = lo
    elif rule == "or-mid":
        s = (hi + lo) / 2
    else:
        s = entry * (1 - stop_pct / 100)
    return math.floor((s + 1e-9) * 100) / 100


def orb_history(segs, before_day, plan, cfg, family=None):
    """The opening-range rule on every earlier complete session: a completed close above
    the first 15 minutes' high inside the entry window, entry at the next candle's open."""
    fee, slip, one = costs(cfg)
    win_a, win_b = (cfg.get("entry_window_minutes") or [15, 120])[:2]
    flat_min = int(cfg.get("flat_by_minutes") or 0)
    stop_rule = plan["stop_rule"] if plan["stop_rule"] in ("or-low", "or-mid") else "pct"
    stop_pct = 100 * (plan["entry"] - plan["stop"]) / plan["entry"]
    target_r = plan["target_r"]
    pool = [s for s in segs if s["complete"] and s["day"] < before_day and (family is None or s["family"] == family)]
    trades, skipped, blocked = [], 0, 0
    for s in pool:
        bars = s["bars"]
        if len(bars) < OPENING_CANDLES + 2:
            continue
        hi = max(b["h"] for b in bars[:OPENING_CANDLES])
        lo = min(b["l"] for b in bars[:OPENING_CANDLES])
        cutoff = s["end"] - flat_min * MINUTE
        trig = None
        for i in range(OPENING_CANDLES, len(bars)):
            close_t = bars[i]["t"] + FIVE
            if close_t > min(s["start"] + win_b * MINUTE, cutoff):
                break
            if close_t >= s["start"] + win_a * MINUTE and bars[i]["c"] > hi:
                trig = i
                break
        if trig is None:
            continue
        after = [b for b in bars[trig + 1:] if b["t"] + FIVE <= cutoff]
        if not after:
            skipped += 1
            continue
        pc = prior_close(segs, s["day"])
        band = psx.price_band(pc) if pc else None
        if band and locked_at(after[0], band["upper"]):
            blocked += 1          # locked at the upper limit: a buy queues and does not fill
            continue
        entry = after[0]["o"]
        stop = rule_stop(stop_rule, hi, lo, entry, stop_pct)
        if not 0 < stop < entry:
            skipped += 1
            continue
        target = round(entry + (entry - stop) * target_r, 2)
        if psx.net_per_share(entry, target, fee, slip, one) <= 1e-9:
            skipped += 1
            continue
        outcome, exit_ = walk(after, stop, target, band)
        trades.append({"day": s["day"], "session": s["family"], "entry_at": psx.hhmm(after[0]["t"]),
                       "entry": round(entry, 2), "stop": stop, "target": target, "outcome": outcome,
                       "exit": round(exit_, 2), "net_r": round(psx.net_per_share(entry, exit_, fee, slip, one) / (entry - stop), 3)})
    count = lambda o: sum(1 for t in trades if t["outcome"] == o)  # noqa: E731
    return {"sessions": len(pool), "fired": len(trades), "target": count("target"), "stop": count("stop"),
            "neither": count("close"), "locked": count("locked"), "skipped": skipped, "blocked_at_upper_limit": blocked,
            "avg_net_r": round(statistics.mean(t["net_r"] for t in trades), 3) if trades else None,
            "rule": {"opening_range_minutes": OPENING_CANDLES * 5, "stop_rule": stop_rule,
                     "stop_pct": round(stop_pct, 3) if stop_rule == "pct" else None, "target_r": round(target_r, 2),
                     "entry_window_minutes": [win_a, win_b], "family": family or "all"},
            "trades": trades}


# ---------------------------------------------------------------- the run

def need_message(sym, family, found, need, segs):
    per_week = 4 if family.startswith("Monday") or "Monday" in family else 1
    more = need - found
    weeks = -(-more // per_week)
    recorded = len({s["day"] for s in segs if s["complete"]})
    return ("Not enough recorded history yet for %s. The Time Machine needs at least %d complete earlier %s "
            "sessions and found %d (you have %d recorded day(s) in all; 20 or more is the upstream default). "
            "PSX only publishes the latest session's trades, so history is what you record: run "
            "`python3 psx-trader-timemachine/timemachine.py record %s` after every close. "
            "That is %d more %s session(s), about %d week(s) of recording. Meanwhile `run --daily` gives a "
            "swing-trade view from daily candles." % (sym, need, family, found, recorded, sym, more, family, weeks))


def time_machine(plan, cfg, paths=10000, seed=19, jitter=2, min_sessions=3, now=None, use_latest=True):
    if not 1 <= paths <= 100000:
        raise psx.PsxError("--paths must be between 1 and 100,000.")
    if not 0 <= jitter <= 6:
        raise psx.PsxError("--jitter must be between 0 and 6 slots.")
    if min_sessions < 1:
        raise psx.PsxError("--min-sessions must be at least 1.")
    sym = plan["symbol"]
    where = place_plan(plan, cfg)
    segs, notes = load_sessions(sym, cfg, now, use_latest)
    pool_sessions = comparable(segs, where["family"], plan["session_date"], where["slots"])
    if len(pool_sessions) < min_sessions:
        raise psx.PsxError(need_message(sym, where["family"], len(pool_sessions), min_sessions, segs))
    warnings = []
    if where["note"]:
        warnings.append(where["note"])
    if len(pool_sessions) < UPSTREAM_MIN_SESSIONS:
        warnings.append("Only %d comparable sessions (upstream wants %d): treat every percentage as rough." % (len(pool_sessions), UPSTREAM_MIN_SESSIONS))
    filled = sum(len(s.get("filled") or []) for s in pool_sessions)
    if filled:
        warnings.append("%d quiet 5-minute slot(s) in the pool had no trade and were filled flat." % filled)
    band = plan["band"]
    if not band:
        pc = prior_close(segs, plan["session_date"])
        band = psx.price_band(pc) if pc else None
    if band:
        band = {"lower": float(band["lower"]), "upper": float(band["upper"]), "basis": band.get("basis", "plan")}
        if not band["lower"] < plan["entry"] < band["upper"]:
            warnings.append("The entry %.2f is outside the estimated band %.2f-%.2f: band left out of the replay."
                            % (plan["entry"], band["lower"], band["upper"]))
            band = None
    if not band and not any("band left out" in w for w in warnings):
        warnings.append("Price band unknown: limit locks are not modelled.")
    qty = plan_qty(sym)
    pool = build_pool(pool_sessions, where["slots"])
    mc = simulate(pool, where["slots"], where["k"], where["last"], plan["entry"], plan["stop"], plan["target"], cfg,
                  band, paths, seed, jitter, qty)
    mc.update({"family": where["family"], "entry_at": where["entry_at"], "flat_by": where["flat_by"],
               "pool_sessions": len(pool_sessions), "pool_from": pool_sessions[0]["day"], "pool_to": pool_sessions[-1]["day"]})
    history = orb_history(segs, plan["session_date"], plan, cfg)
    same = orb_history(segs, plan["session_date"], plan, cfg, where["family"])
    history["same_family"] = {k: same[k] for k in ("sessions", "fired", "target", "stop", "neither", "avg_net_r")}
    return {
        "created_at": psx.now_pkt().strftime("%Y-%m-%d %H:%M PKT"), "mode": "intraday",
        "symbol": sym, "session_date": plan["session_date"],
        "plan": {k: plan[k] for k in ("entry", "stop", "target", "stop_rule", "target_r", "entry_time", "flat_by")},
        "band": band, "mc": mc, "history": history,
        "verdict": verdict(mc), "verdict_notes": verdict_notes(mc), "warnings": warnings + notes,
        "note": "A simulation from %s's own recorded %s sessions (%s to %s). Not a prediction: news, results, "
                "halts and limit locks can do what those sessions never did. Same data and seed, same numbers."
                % (sym, where["family"], pool_sessions[0]["day"], pool_sessions[-1]["day"]),
    }


def daily_machine(plan, cfg, paths=10000, seed=19, days=5, now=None):
    """Swing-trade view: replays up to `days` trading days from daily candles."""
    if not 1 <= days <= 60:
        raise psx.PsxError("--days must be between 1 and 60.")
    bars = psx.completed_daily(psx.daily_bars(plan["symbol"], cfg), now, cfg)[-251:]
    if len(bars) < 21:
        raise psx.PsxError("Only %d completed daily candles for %s; the daily view needs 21 or more." % (len(bars), plan["symbol"]))
    pool = [(b["o"] / p["c"], b["h"] / p["c"], b["l"] / p["c"], b["c"] / p["c"]) for p, b in zip(bars, bars[1:])]
    fee, slip, _ = costs(cfg)
    entry, stop, target = plan["entry"], plan["stop"], plan["target"]
    risk = entry - stop
    rng = random.Random(seed)
    counts = {"target": 0, "stop": 0, "close": 0, "locked": 0}
    rs = []
    qty = plan_qty(plan["symbol"])
    rupees = []
    for _ in range(paths):
        price, outcome, exit_ = entry, None, None
        prev = entry
        for _d in range(days):
            o, h, l, c = rng.choice(pool)
            band = psx.price_band(prev)
            bar = clamp_bar(prev * o, prev * h, prev * l, prev * c, band)
            prev = price = bar["c"]
            if locked_at(bar, band["lower"]):
                continue
            if bar["o"] <= stop:
                outcome, exit_ = "stop", bar["o"]
            elif bar["l"] <= stop:
                outcome, exit_ = "stop", stop
            elif bar["h"] >= target:
                outcome, exit_ = "target", target
            if outcome:
                break
        if outcome is None:
            outcome, exit_ = "close", price
        counts[outcome] += 1
        net = psx.net_per_share(entry, exit_, fee, slip, False)
        rs.append(net / risk)
        rupees.append(net * (qty or 1))
    rs_s, ru_s = sorted(rs), sorted(rupees)
    mc = {"paths": paths, "seed": seed, "days": days, "daily_candles": len(pool),
          "p_target": round(counts["target"] / paths, 4), "p_stop": round(counts["stop"] / paths, 4),
          "p_open_at_flat_by": round(counts["close"] / paths, 4), "p_locked": 0.0, "counts": counts,
          "avg_net_r": round(statistics.mean(rs), 3), "median_net_r": round(pct(rs_s, 0.5), 3),
          "rupees_basis": "%d shares" % qty if qty else "per share",
          "p10": round(pct(ru_s, 0.1), 2), "p50": round(pct(ru_s, 0.5), 2), "p90": round(pct(ru_s, 0.9), 2),
          "r_at_target": round((target - entry) / risk, 2),
          "net_target_r": round(psx.net_per_share(entry, target, fee, slip, False) / risk, 3),
          "net_stop_r": round(-psx.net_per_share(entry, stop, fee, slip, False) / risk, 3)}
    return {"created_at": psx.now_pkt().strftime("%Y-%m-%d %H:%M PKT"), "mode": "daily (swing-trade view)",
            "symbol": plan["symbol"], "session_date": plan["session_date"],
            "plan": {k: plan[k] for k in ("entry", "stop", "target", "target_r")}, "mc": mc, "history": None,
            "verdict": verdict(mc), "verdict_notes": verdict_notes(mc),
            "warnings": ["Swing-trade view from daily candles, held up to %d trading days and sold at the last close. "
                         "It says nothing about the intraday path; overnight gaps and the sale commission "
                         "(no same-day waiver) are included." % days],
            "note": "A simulation from %s's last %d daily moves. Not a prediction." % (plan["symbol"], len(pool))}


# ---------------------------------------------------------------- output

def pc(x):
    return "%.1f%%" % (100 * x)


def report(doc):
    p, m, h = doc["plan"], doc["mc"], doc["history"]
    lines = ["%s on %s: entry %s, stop %s, target %s (%gR)." % (doc["symbol"], doc["session_date"], psx.rs(p["entry"]),
                                                             psx.rs(p["stop"]), psx.rs(p["target"]), m["r_at_target"])]
    if doc["mode"] == "intraday":
        lines.append("%s replays of the %s session from %s to flat-by %s (%d five-minute candles), seed %d, jitter +-%d slots."
                     % ("{:,}".format(m["paths"]), m["family"], m["entry_at"], m["flat_by"], m["candles"], m["seed"], m["jitter"]))
        lines.append("Candles drawn from %d recorded %s sessions (%s to %s)." % (m["pool_sessions"], m["family"], m["pool_from"], m["pool_to"]))
        end = "still open at %s" % m["flat_by"]
    else:
        lines.append("SWING-TRADE VIEW (daily candles, not intraday): %s replays of up to %d trading days, seed %d."
                     % ("{:,}".format(m["paths"]), m["days"], m["seed"]))
        end = "still open after %d days" % m["days"]
    lines += ["",
              "  target first   %s" % pc(m["p_target"]),
              "  stop first     %s" % pc(m["p_stop"]),
              "  neither        %-7s %s" % (pc(m["p_open_at_flat_by"]), end)]
    if m.get("p_locked"):
        lines.append("  locked         %-7s stuck at the lower limit, could not sell" % pc(m["p_locked"]))
    lines += ["",
              "  Net R after charges: average %+.3f, median %+.3f." % (m["avg_net_r"], m["median_net_r"]),
              "  Net result (%s): P10 %s, P50 %s, P90 %s." % (m["rupees_basis"], psx.rs(m["p10"]), psx.rs(m["p50"]), psx.rs(m["p90"])),
              ""]
    if h:
        ru = h["rule"]
        stop_words = {"or-low": "opening-range low", "or-mid": "opening-range midpoint"}.get(ru["stop_rule"], "%.2f%% below entry" % (ru["stop_pct"] or 0))
        if h["fired"]:
            lines.append("History: the opening-range rule (15-min range, stop at the %s, %gR target) on %d earlier recorded "
                         "sessions fired %d times: %d target, %d stop, %d neither%s. Average net R %+.3f."
                         % (stop_words, ru["target_r"], h["sessions"], h["fired"], h["target"], h["stop"], h["neither"],
                            ", %d locked" % h["locked"] if h["locked"] else "", h["avg_net_r"]))
            sf = h["same_family"]
            if sf["sessions"] != h["sessions"]:
                lines.append("  %s sessions only: fired %d of %d (%d target, %d stop)." % (m["family"], sf["fired"], sf["sessions"], sf["target"], sf["stop"]))
        else:
            lines.append("History: the opening-range rule never fired in the %d earlier recorded sessions." % h["sessions"])
        lines.append("")
    lines += [doc["verdict"]] + doc["verdict_notes"] + [""]
    lines += ["Note: " + w for w in doc["warnings"]]
    lines.append(doc["note"] + " Repeat with --seed %d." % m["seed"])
    return lines


# ---------------------------------------------------------------- commands

def cmd_record(a, cfg):
    clock = psx.market_clock(cfg=cfg)
    if clock["open"]:
        print("PSX is open now (%s): only finished candles are saved; record again after the close." % clock["session"])
    for raw in a.symbols.split(","):
        if not raw.strip():
            continue
        sym = psx.clean_symbol(raw)
        written = psx.record_session(sym, cfg)
        segs, _ = load_sessions(sym, cfg, use_latest=False)
        by_family = {}
        for s in segs:
            if s["complete"]:
                by_family[s["family"]] = by_family.get(s["family"], 0) + 1
        days = len({s["day"] for s in segs})
        print("%s: saved %s. Stored: %d day(s); complete sessions: %s."
              % (sym, ", ".join("trader/bars/%s/%s" % (sym, os.path.basename(w)) for w in written), days,
                 ", ".join("%s %d" % kv for kv in sorted(by_family.items())) or "none yet"))
    print("Run this after every close: Monday-Thursday after 15:30, Friday after 16:30 (one run saves both Friday "
          "sessions). For example a daily task at 16:45 PKT, Monday to Friday. The Time Machine needs 3 comparable "
          "sessions to run and 20 or more to be worth much.")
    return 0


def cmd_run(a, cfg):
    plan = load_plan(a, cfg)
    if a.daily:
        doc = daily_machine(plan, cfg, a.paths, a.seed, a.days)
    else:
        doc = time_machine(plan, cfg, a.paths, a.seed, a.jitter, a.min_sessions)
    if a.json:
        print(json.dumps(doc, indent=2))
    else:
        print("\n".join(report(doc)))
    if a.write:
        print("Wrote %s." % psx.write_json(psx.path("timemachine.json"), doc))
    if not a.json:
        print("Next: psx-trader-budget sizes it to your capital and your max loss per trade.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="PSX Time Machine: replay a planned day trade (psx-trader-timemachine).")
    sub = ap.add_subparsers(dest="cmd")
    r = sub.add_parser("record", help="save the latest session's 5-minute candles (run after every close)")
    r.add_argument("symbols", help="SYMBOL or SYMBOL,SYMBOL")
    p = sub.add_parser("run", help="replay the plan")
    p.add_argument("--plan", default=None, help="plan file (default trader/plan.json)")
    p.add_argument("--paths", type=int, default=10000)
    p.add_argument("--seed", type=int, default=19)
    p.add_argument("--jitter", type=int, default=2, help="draw from the same time of day +- this many slots")
    p.add_argument("--min-sessions", type=int, default=3)
    p.add_argument("--entry-time", help="the time the entry filled, HH:MM PKT (default: plan, entry.json, or end of opening range)")
    p.add_argument("--flat-by", help="close by this time, HH:MM PKT (default: the plan's flat_by)")
    p.add_argument("--date", help="the plan's session date (default: the plan's session_date)")
    p.add_argument("--symbol", help=argparse.SUPPRESS)
    p.add_argument("--daily", action="store_true", help="swing-trade view from daily candles (no recorded history needed)")
    p.add_argument("--days", type=int, default=5, help="with --daily: trading days to hold at most")
    p.add_argument("--json", action="store_true")
    p.add_argument("--write", action="store_true", help="save trader/timemachine.json")
    a = ap.parse_args(argv)
    if not a.cmd:
        ap.print_help()
        return 1
    cfg = psx.load_config()
    if a.cmd == "record":
        return cmd_record(a, cfg)
    a.plan = a.plan or psx.path("plan.json")
    return cmd_run(a, cfg)


if __name__ == "__main__":
    psx.run(main)
