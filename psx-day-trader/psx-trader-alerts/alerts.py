#!/usr/bin/env python3
"""psx-trader-alerts: PSX clock, quotes and alerts that ring once.

  python3 psx-trader-alerts/alerts.py clock
  python3 psx-trader-alerts/alerts.py quote OGDC,PPL --write
  python3 psx-trader-alerts/alerts.py quote --holdings --write
  python3 psx-trader-alerts/alerts.py add --from-plan
  python3 psx-trader-alerts/alerts.py add OGDC --below 305.50
  python3 psx-trader-alerts/alerts.py add OGDC --above 320
  python3 psx-trader-alerts/alerts.py list
  python3 psx-trader-alerts/alerts.py remove ogdc-below-305.5
  python3 psx-trader-alerts/alerts.py check

An alert is information, never an order. Quotes come from PSX Market Watch
through your PSX Tracker server: the latest traded price, which can lag.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

TIME_GRACE_MINUTES = 30   # a session-time reminder found later than this is skipped, not rung late


# ---------------------------------------------------------------- files


def load_alerts():
    data = psx.read_json(psx.path("alerts.json"), "alerts", required=False) or {}
    data.setdefault("alerts", [])
    data.setdefault("time_rang", {})
    return data


def save_alerts(data):
    psx.write_json(psx.path("alerts.json"), data)


def stamp(now):
    return now.strftime("%Y-%m-%d %H:%M PKT")


def symbols_arg(values):
    out = []
    for v in values or []:
        out.extend(p for p in re.split(r"[,\s]+", v) if p)
    return [psx.clean_symbol(s) for s in out]


def holdings():
    """Symbols you hold or plan to trade: portfolio.json, orders.json, plan.json."""
    syms = []
    port = psx.read_json(psx.path("portfolio.json"), "portfolio", required=False) or {}
    syms += [p.get("symbol") for p in port.get("positions") or []]
    orders = psx.read_json(psx.path("orders.json"), "orders", required=False) or {}
    syms += [o.get("symbol") for o in orders.get("orders") or []]
    plan = psx.read_json(psx.path("plan.json"), "plan", required=False) or {}
    syms.append(plan.get("symbol"))
    out = []
    for s in syms:
        if s:
            s = psx.clean_symbol(s)
            if s not in out:
                out.append(s)
    return out


# ---------------------------------------------------------------- clock


def clock_text(now, cfg):
    c = psx.market_clock(now, cfg)
    day = now.strftime("%Y-%m-%d")
    lines = ["It is %s (%s)." % (c["now"], now.strftime("%A"))]
    sess = psx.sessions(day, cfg)
    if c["open"]:
        lines.append("PSX is OPEN: %s session, continuous trading until %s." % (c["session"], c["closes_at"]))
    else:
        lines.append("PSX is CLOSED now.")
    if sess:
        parts = ["%s-%s (%s)" % (psx.hhmm(s["start"]), psx.hhmm(s["end"]), s["family"]) for s in sess]
        lines.append("Today's continuous trading: " + ", ".join(parts) + ".")
        if len(sess) == 2:
            lines.append("Friday break: no continuous trading from %s to %s (Jumma prayers)." % (psx.hhmm(sess[0]["end"]), psx.hhmm(sess[1]["start"])))
        t = psx.ms(now)
        if t < sess[0]["start"]:
            lines.append("Pre-open: orders can be entered before the open; trading starts at %s." % psx.hhmm(sess[0]["start"]))
        elif len(sess) == 2 and sess[0]["end"] <= t < sess[1]["start"]:
            lines.append("It is the Friday break. Trading resumes at %s." % psx.hhmm(sess[1]["start"]))
        elif t >= sess[-1]["end"]:
            lines.append("Today's trading is over.")
    elif psx.is_holiday(day, cfg):
        lines.append("Today is a PSX holiday.")
    else:
        lines.append("No trading today (weekend).")
    lines.append("Next open: %s." % c["next_open"])
    lines.append(c["note"] + " Eid and other moon-dependent holidays go in extra_holidays in trader/config.json.")
    return "\n".join(lines)


def time_events(day, cfg):
    """Built-in reminders for a trading day: [(key, time_ms, words)]."""
    sess = psx.sessions(day, cfg)
    flat = int(cfg.get("flat_by_minutes") or 5) * psx.MINUTE_MS
    out = []
    for i, s in enumerate(sess):
        last = i == len(sess) - 1
        out.append(("open-%d" % i, s["start"], "PSX %s session is open (continuous trading from %s)." % (s["family"], psx.hhmm(s["start"]))))
        out.append(("flat-%d" % i, s["end"] - flat, "Flat-by: %s. Close any day trade before %s%s." % (
            psx.hhmm(s["end"] - flat), psx.hhmm(s["end"]), "" if last else " (the Friday break)")))
        if last:
            out.append(("close", s["end"], "PSX continuous trading has closed for today (%s)." % psx.hhmm(s["end"])))
        else:
            out.append(("break", s["end"], "Friday break: no trading until %s." % psx.hhmm(sess[i + 1]["start"])))
    return out


# ---------------------------------------------------------------- quotes


def quote_rows(symbols, cfg, now):
    q = psx.quotes(symbols, cfg)
    rows = {}
    for s in symbols:
        r = q.get(s)
        if not r:
            continue
        rows[s] = {"price": r.get("current"), "current": r.get("current"), "ldcp": r.get("ldcp"), "change_pct": r.get("change_pct"),
                   "high": r.get("high"), "low": r.get("low"), "volume": r.get("volume"), "time": stamp(now)}
    missing = [s for s in symbols if s not in rows]
    return rows, missing


def stale_notes(rows, now, cfg):
    c = psx.market_clock(now, cfg)
    notes = []
    if c["open"]:
        notes.append("Market Watch shows the latest traded price and can lag by a minute or more. Check your broker app before acting.")
    else:
        notes.append("PSX is closed: these are the last traded prices of the latest session, not live quotes.")
    for s, r in sorted(rows.items()):
        if not r.get("volume"):
            notes.append("%s has not traded today: its price is the previous close." % s)
        elif not r.get("price"):
            notes.append("%s has no current price on Market Watch." % s)
    return notes


def cmd_quote(args, cfg, now):
    syms = holdings() if args.holdings else symbols_arg(args.symbols)
    if not syms:
        raise psx.PsxError("No symbols. Give some (OGDC,PPL) or use --holdings with portfolio.json, orders.json or plan.json.")
    rows, missing = quote_rows(syms, cfg, now)
    print(psx.table([dict(v, symbol=k) for k, v in rows.items()], [
        ("symbol", "symbol"), ("price", lambda r: "%.2f" % r["price"] if r["price"] is not None else "-"),
        ("prev close", lambda r: "%.2f" % r["ldcp"] if r["ldcp"] is not None else "-"),
        ("change %", lambda r: "%+.2f" % r["change_pct"] if r["change_pct"] is not None else "-"),
        ("high", lambda r: "%.2f" % r["high"] if r["high"] is not None else "-"),
        ("low", lambda r: "%.2f" % r["low"] if r["low"] is not None else "-"),
        ("volume", lambda r: "{:,.0f}".format(r["volume"]) if r["volume"] is not None else "-"),
    ]))
    for m in missing:
        print("%s is not on PSX Market Watch right now (wrong symbol, suspended, or not traded)." % m)
    for n in stale_notes(rows, now, cfg):
        print("Note: " + n)
    if args.write and rows:
        p = psx.path("prices.json")
        data = psx.read_json(p, "prices", required=False) or {}
        data.update(rows)
        psx.write_json(p, data)
        print("Wrote %d price(s) to %s." % (len(rows), p))
    return 0


# ---------------------------------------------------------------- alert rules


def add_rule(data, rule):
    data["alerts"] = [a for a in data["alerts"] if a["id"] != rule["id"]]
    data["alerts"].append(rule)
    return rule


def cmd_add(args, cfg, now):
    data = load_alerts()
    added = []
    if args.from_plan:
        plan = psx.read_json(psx.path("plan.json"), "trade plan (run psx-trader-exit first)")
        sym = psx.clean_symbol(plan.get("symbol"))
        day = plan.get("session_date") or now.strftime("%Y-%m-%d")
        base = {"symbol": sym, "date": day, "source": "plan", "created_at": stamp(now), "rang_at": None}
        if plan.get("stop"):
            added.append(add_rule(data, dict(base, id="%s-plan-stop" % sym.lower(), kind="stop", price=float(plan["stop"]),
                                             label="%s stop %.2f: your plan says exit" % (sym, float(plan["stop"])))))
        if plan.get("target"):
            added.append(add_rule(data, dict(base, id="%s-plan-target" % sym.lower(), kind="target", price=float(plan["target"]),
                                             label="%s target %.2f reached" % (sym, float(plan["target"])))))
        if plan.get("flat_by"):
            added.append(add_rule(data, dict(base, id="%s-plan-flat" % sym.lower(), kind="time", at=plan["flat_by"],
                                             label="Flat-by %s: sell any %s still open" % (plan["flat_by"], sym))))
        if not added:
            raise psx.PsxError("plan.json has no stop, target or flat_by.")
    else:
        if not args.symbol or (args.above is None) == (args.below is None):
            raise psx.PsxError("Use: add SYMBOL --above PRICE, add SYMBOL --below PRICE, or add --from-plan.")
        sym = psx.clean_symbol(args.symbol)
        kind, price = ("above", args.above) if args.above is not None else ("below", args.below)
        if price <= 0:
            raise psx.PsxError("The price must be above 0.")
        rid = "%s-%s-%s" % (sym.lower(), kind, ("%g" % price))
        added.append(add_rule(data, {"id": rid, "symbol": sym, "kind": kind, "price": float(price), "date": args.date,
                                     "label": args.label or "%s %s %.2f" % (sym, "at or above" if kind == "above" else "at or below", price),
                                     "source": "manual", "created_at": stamp(now), "rang_at": None}))
    save_alerts(data)
    for a in added:
        print("Added %s: %s%s" % (a["id"], a["label"], " (on %s only)" % a["date"] if a.get("date") else ""))
    print("Each alert rings once. Run check to look (repeat it with /loop or a scheduled task).")
    return 0


def describe(a):
    if a["kind"] == "time":
        return "time %s" % a["at"]
    return "%s %.2f" % ({"stop": "at/below", "below": "at/below", "target": "at/above", "above": "at/above"}[a["kind"]], a["price"])


def cmd_list(args, cfg, now):
    data = load_alerts()
    if not data["alerts"]:
        print("No alerts. Add one with: add OGDC --below 305.50, or add --from-plan.")
        return 0
    print(psx.table(data["alerts"], [
        ("id", "id"), ("symbol", lambda a: a.get("symbol") or "-"), ("rule", describe),
        ("date", lambda a: a.get("date") or "any day"), ("status", lambda a: "rang %s" % a["rang_at"] if a.get("rang_at") else "waiting"),
    ]))
    print("Session reminders (open, flat-by, Friday break, close) ring on every trading day unless check --no-time.")
    return 0


def cmd_remove(args, cfg, now):
    data = load_alerts()
    if args.all:
        n = len(data["alerts"])
        data["alerts"] = []
    elif args.rang:
        before = len(data["alerts"])
        data["alerts"] = [a for a in data["alerts"] if not a.get("rang_at")]
        n = before - len(data["alerts"])
    else:
        if not args.id:
            raise psx.PsxError("Say which alert: remove ID (see list), remove --rang, or remove --all.")
        before = len(data["alerts"])
        data["alerts"] = [a for a in data["alerts"] if a["id"] != args.id]
        n = before - len(data["alerts"])
        if not n:
            raise psx.PsxError("No alert called %s. See list." % args.id)
    save_alerts(data)
    print("Removed %d alert(s)." % n)
    return 0


def hits(a, price):
    if price is None:
        return False
    if a["kind"] in ("stop", "below"):
        return price <= a["price"]
    return price >= a["price"]


def cmd_check(args, cfg, now):
    data = load_alerts()
    today = now.strftime("%Y-%m-%d")
    t = psx.ms(now)
    rang, notes = [], []
    active = [a for a in data["alerts"] if not a.get("rang_at") and (not a.get("date") or a["date"] == today)]

    # price alerts: one Market Watch request for all symbols
    price_rules = [a for a in active if a["kind"] != "time"]
    if price_rules:
        syms = sorted({a["symbol"] for a in price_rules})
        rows, missing = quote_rows(syms, cfg, now)
        for a in price_rules:
            r = rows.get(a["symbol"])
            if not r:
                continue
            if hits(a, r["price"]):
                a["rang_at"] = stamp(now)
                rang.append("%s: %s (last traded %.2f)" % (a["symbol"], a["label"], r["price"]))
            elif a["kind"] in ("stop", "below") and r.get("low") is not None and r["low"] <= a["price"]:
                notes.append("%s traded as low as %.2f today, at or below %.2f, but is %.2f now (not rung)." % (a["symbol"], r["low"], a["price"], r["price"]))
            elif a["kind"] in ("target", "above") and r.get("high") is not None and r["high"] >= a["price"]:
                notes.append("%s traded as high as %.2f today, at or above %.2f, but is %.2f now (not rung)." % (a["symbol"], r["high"], a["price"], r["price"]))
        for m in missing:
            notes.append("%s is not on Market Watch right now, so its alerts were not checked." % m)
        notes += stale_notes(rows, now, cfg)

    # your own time alerts (from the plan): ring once on their date once the time has passed
    for a in active:
        if a["kind"] == "time" and psx.sessions(today, cfg) and now.strftime("%H:%M") >= str(a["at"]).zfill(5):
            a["rang_at"] = stamp(now)
            rang.append(a["label"])

    # built-in session reminders, once per day each, and only close to their time
    if not args.no_time:
        done = data["time_rang"].get(today, [])
        grace = TIME_GRACE_MINUTES * psx.MINUTE_MS
        for key, at, words in time_events(today, cfg):
            if key in done or t < at:
                continue
            done.append(key)
            if t < at + grace:
                rang.append("%s %s" % (psx.hhmm(at), words))
        data["time_rang"] = {today: done}

    save_alerts(data)
    print("Alert check at %s." % stamp(now))
    if rang:
        for r in rang:
            print("RING: " + r)
    else:
        print("Nothing rang.")
    for n in notes:
        print("Note: " + n)
    waiting = [a for a in data["alerts"] if not a.get("rang_at")]
    print("%d alert(s) still waiting. An alert is a reminder, not an order: act in your broker's app." % len(waiting))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="PSX clock, quotes and alerts. Never places orders.")
    ap.add_argument("--now", help="pretend it is this Pakistan time (YYYY-MM-DD HH:MM)")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("clock", help="is PSX open, sessions today, next open")
    q = sub.add_parser("quote", help="latest Market Watch prices")
    q.add_argument("symbols", nargs="*")
    q.add_argument("--holdings", action="store_true", help="portfolio.json + orders.json + plan.json symbols")
    q.add_argument("--write", action="store_true", help="merge into trader/prices.json")
    a = sub.add_parser("add", help="add an alert")
    a.add_argument("symbol", nargs="?")
    a.add_argument("--above", type=float)
    a.add_argument("--below", type=float)
    a.add_argument("--from-plan", action="store_true", help="stop, target and flat-by from trader/plan.json")
    a.add_argument("--label")
    a.add_argument("--date", help="watch on this date only (YYYY-MM-DD)")
    sub.add_parser("list", help="show alerts")
    r = sub.add_parser("remove", help="delete an alert")
    r.add_argument("id", nargs="?")
    r.add_argument("--rang", action="store_true", help="remove every alert that already rang")
    r.add_argument("--all", action="store_true")
    c = sub.add_parser("check", help="fetch prices once and ring what hit")
    c.add_argument("--no-time", action="store_true", help="skip the session reminders")
    args = ap.parse_args(argv)
    now = psx.parse_pkt(args.now) if args.now else psx.now_pkt()
    cfg = psx.load_config()
    if args.cmd == "clock":
        print(clock_text(now, cfg))
        return 0
    handlers = {"quote": cmd_quote, "add": cmd_add, "list": cmd_list, "remove": cmd_remove, "check": cmd_check}
    if args.cmd not in handlers:
        ap.print_help()
        return 1
    return handlers[args.cmd](args, cfg, now)


if __name__ == "__main__":
    psx.run(main)
