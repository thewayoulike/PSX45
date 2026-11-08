#!/usr/bin/env python3
"""psx-trader-broker: the PSX order ticket.

Pakistani brokers have no public order connection, so this never sends an
order anywhere. It prints each proposed order as a plain ticket you type into
your own broker's app, records your yes, and keeps an append-only log of what
happened (trader/state/broker.json) so psx-trader-risk can count today's trades
and losses.

  python3 psx-trader-broker/ticket.py show
  python3 psx-trader-broker/ticket.py confirm --index 1 --reply "yes"
  python3 psx-trader-broker/ticket.py result --index 1 --status filled --fill 312.50
  python3 psx-trader-broker/ticket.py result --index 1 --status filled --fill 312.50 --exit 318.00
  python3 psx-trader-broker/ticket.py log
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

STATUSES = ("placed", "filled", "cancelled", "denied")
YES_WORDS = ("yes", "y", "haan", "han", "ji haan", "jee haan", "ok yes", "yes please")
NOT_A_YES = re.compile(r"\b(no|not|don'?t|dont|wait|later|maybe|all|every|both|each|cancel|stop)\b", re.I)


# ---------------------------------------------------------------- reading files


def load_orders():
    data = psx.read_json(psx.path("orders.json"), "orders file (run psx-trader-budget first)")
    orders = data.get("orders") or []
    if not orders:
        raise psx.PsxError("orders.json has no orders. Run psx-trader-budget first.")
    return orders


def load_risk():
    return psx.read_json(psx.path("risk.json"), "risk check", required=False) or {}


def load_log():
    data = psx.read_json(psx.path("state", "broker.json"), "broker log", required=False) or {}
    data.setdefault("orders", [])
    return data


def append_log(entry):
    """Append one entry. Earlier entries are never changed or removed."""
    data = load_log()
    data["orders"].append(entry)
    psx.write_json(psx.path("state", "broker.json"), data)
    return entry


def pick(orders, index):
    if index < 1 or index > len(orders):
        raise psx.PsxError("There is no order %d. orders.json has %d order(s)." % (index, len(orders)))
    return orders[index - 1]


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- money


def est_cost(o, cfg):
    if num(o.get("est_cost")) is not None:
        return num(o["est_cost"])
    qty, limit = num(o.get("qty")), num(o.get("limit"))
    if not qty or not limit:
        return None
    return qty * psx.buy_cost(limit, cfg["fee_pct"], cfg["slip_pct"])


def max_loss(o, cfg):
    if num(o.get("max_loss_at_stop")) is not None:
        return num(o["max_loss_at_stop"])
    qty, limit, stop = num(o.get("qty")), num(o.get("limit")), num(o.get("stop"))
    if not qty or not limit or not stop:
        return None
    return -qty * psx.net_per_share(limit, stop, cfg["fee_pct"], cfg["slip_pct"], cfg.get("one_side_commission"))


def realized(qty, fill, exit_, cfg):
    """Rupees made or lost on a round trip at the actual prices, after PSX charges both sides."""
    return round(qty * psx.net_per_share(fill, exit_, cfg["fee_pct"], 0.0, cfg.get("one_side_commission")), 2)


# ---------------------------------------------------------------- readiness


def readiness(o, risk, now):
    """(ready, reasons). READY only when psx-trader-risk passed this exact order today."""
    reasons = []
    today = now.strftime("%Y-%m-%d")
    if str(o.get("side", "buy")).lower() != "buy":
        reasons.append("this pack is long only: a ticket can only buy (sell what you hold in your broker app)")
    for key in ("qty", "limit", "stop"):
        if not num(o.get(key)) or num(o.get(key)) <= 0:
            reasons.append("the order has no valid %s" % key)
    if num(o.get("limit")) and abs(num(o["limit"]) - psx.round_tick(num(o["limit"]))) > 1e-9:
        reasons.append("the limit price %s is not on the Rs 0.01 price step" % o["limit"])
    if num(o.get("stop")) and num(o.get("limit")) and num(o["stop"]) >= num(o["limit"]):
        reasons.append("the stop is not below the limit price")
    verdict = next((v for v in risk.get("verdicts") or [] if v.get("id") == o.get("id")), None)
    if not risk:
        reasons.append("no risk check yet: run psx-trader-risk")
    elif verdict is None:
        reasons.append("psx-trader-risk has not checked this order (id %s)" % o.get("id"))
    else:
        checked = str(risk.get("checked_at") or "")[:10]
        if checked != today:
            reasons.append("the risk check is from %s, not today (%s): run psx-trader-risk again" % (checked or "an unknown day", today))
        if verdict.get("verdict") != "PASS":
            reasons.append("psx-trader-risk said %s" % (verdict.get("verdict") or "nothing"))
            reasons.extend("  - %s" % r for r in verdict.get("reasons") or [])
    session = o.get("session_date")
    if session and session < today:
        reasons.append("this order was planned for %s, an earlier session" % session)
    flat_by = o.get("flat_by")
    if flat_by and (not session or session == today) and re.match(r"^\d{1,2}:\d{2}$", flat_by):
        if now.strftime("%H:%M") >= flat_by.zfill(5):
            reasons.append("it is past the flat-by time %s: a day trade should not be opened now" % flat_by)
    return (not reasons), reasons


# ---------------------------------------------------------------- yes check


def is_yes_for(reply, o, orders):
    """True only for an explicit yes about this one order."""
    text = re.sub(r"\s+", " ", str(reply or "")).strip()
    plain = re.sub(r"[^\w\s.']", " ", text.lower()).strip()
    plain = re.sub(r"\s+", " ", plain)
    if not plain:
        return False, "the reply is empty"
    if NOT_A_YES.search(plain):
        return False, "the reply is not a plain yes for one order (%r)" % text
    if not any(plain == w or plain.startswith(w + " ") for w in YES_WORDS):
        return False, "the reply does not start with yes (%r). 'sure', 'ok' or 'go ahead' are not recorded" % text
    sym = str(o.get("symbol") or "").upper()
    others = {str(x.get("symbol") or "").upper() for x in orders} - {sym}
    for word in re.findall(r"[A-Za-z][A-Za-z0-9.]{1,9}", text):
        if word.upper() in others:
            return False, "the reply names %s, but this ticket is %s" % (word.upper(), sym)
    allowed = {num(o.get(k)) for k in ("qty", "limit", "stop", "target")} | {float(i) for i in range(1, 10)}
    for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text):
        if float(n.replace(",", "")) not in allowed:
            return False, "the reply mentions %s, which is not this ticket's quantity or price" % n
    return True, ""


# ---------------------------------------------------------------- printing


def last_status(o):
    rows = [r for r in load_log()["orders"] if r.get("id") == o.get("id")]
    return rows[-1] if rows else None


def ticket_text(i, n, o, risk, cfg, now):
    ready, reasons = readiness(o, risk, now)
    sym = o.get("symbol", "?")
    lines = ["TICKET %d of %d  (%s)" % (i, n, o.get("id", "no id"))]
    lines.append("  BUY %s shares of %s, LIMIT %s, good for the day" % (
        "{:,}".format(int(num(o.get("qty")) or 0)), sym, psx.rs(num(o.get("limit")))))
    lines.append("  stop-loss   %s   (exit if it trades here)" % psx.rs(num(o.get("stop"))))
    lines.append("  target      %s" % psx.rs(num(o.get("target"))))
    lines.append("  flat by     %s PKT on %s (sell anything still open)" % (o.get("flat_by") or "-", o.get("session_date") or "the trade day"))
    lines.append("  est. cost   %s including commission, sales tax, CDC and exchange fees" % psx.rs(est_cost(o, cfg)))
    ml = max_loss(o, cfg)
    lines.append("  max loss    %s if the stop fills at %s (a fast market or a locked limit can fill worse)" % (psx.rs(ml), psx.rs(num(o.get("stop")))))
    if num(o.get("profit_at_target")) is not None:
        lines.append("  at target   %s after charges, before capital gains tax" % psx.rs(num(o["profit_at_target"])))
    for w in o.get("warnings") or []:
        lines.append("  warning: %s" % w)
    prev = last_status(o)
    if prev:
        lines.append("  already logged: %s at %s" % (prev.get("status"), prev.get("at")))
    if ready:
        lines.append("  READY: psx-trader-risk PASS today. Waiting for your yes for this one order.")
        lines.append("  In your broker's app: Buy > %s > Quantity %s > Order type Limit > Price %.2f > Day. Then review and submit there yourself." % (
            sym, int(num(o.get("qty")) or 0), num(o.get("limit")) or 0))
        lines.append("  Most PSX broker apps have no linked stop order: set the stop with psx-trader-alerts and sell yourself if it rings.")
    else:
        lines.append("  NOT READY:")
        lines.extend("    - %s" % r if not r.startswith("  ") else "    %s" % r for r in reasons)
    return "\n".join(lines), ready


# ---------------------------------------------------------------- commands


def cmd_show(args, cfg, now):
    orders = load_orders()
    risk = load_risk()
    clock = psx.market_clock(now, cfg)
    print("PSX order tickets, %s. Nothing is sent anywhere: you enter the order in your broker's app." % clock["now"])
    if clock["open"]:
        print("PSX is open (%s, closes %s)." % (clock["session"], clock["closes_at"]))
    else:
        print("PSX is closed now. Next open: %s." % clock["next_open"])
    ready_count = 0
    for i, o in enumerate(orders, 1):
        if args.index and i != args.index:
            continue
        text, ready = ticket_text(i, len(orders), o, risk, cfg, now)
        ready_count += ready
        print()
        print(text)
    print()
    print("%d of %d ticket(s) READY. Paper mode: %s." % (ready_count, len(orders), "on" if cfg.get("paper", True) else "off"))
    return 0


def cmd_confirm(args, cfg, now):
    orders = load_orders()
    o = pick(orders, args.index)
    ready, reasons = readiness(o, load_risk(), now)
    if not ready:
        print("Not recorded: ticket %d is NOT READY." % args.index)
        for r in reasons:
            print("  - %s" % r.strip())
        return 1
    if args.reply is not None:
        ok, why = is_yes_for(args.reply, o, orders)
        if not ok:
            print("Not recorded: %s. Ask again: 'Enter this ticket in your broker app? Reply yes or no.'" % why)
            return 1
    today = now.strftime("%Y-%m-%d")
    for prev in load_log()["orders"]:
        if prev.get("id") == o.get("id") and prev.get("status") == "ticket" and str(prev.get("at", ""))[:10] == today:
            print("Already recorded your yes for ticket %d (%s) at %s." % (args.index, o.get("symbol"), prev.get("at")))
            return 0
    entry = base_entry(o, "ticket", now, cfg)
    entry["note"] = "user said yes in chat: %r" % args.reply if args.reply is not None else "user said yes in chat"
    append_log(entry)
    print("Recorded your yes for ticket %d: BUY %d %s at limit %s." % (args.index, int(entry["qty"] or 0), entry["symbol"], psx.rs(entry["limit"])))
    print("Now enter it in your broker's app yourself, then tell me what happened (placed, filled, cancelled or denied).")
    return 0


def base_entry(o, status, now, cfg):
    return {
        "id": o.get("id"), "status": status, "symbol": o.get("symbol"),
        "qty": num(o.get("qty")), "limit": num(o.get("limit")), "stop": num(o.get("stop")), "target": num(o.get("target")),
        "at": now.strftime("%Y-%m-%d %H:%M PKT"), "session_date": o.get("session_date") or now.strftime("%Y-%m-%d"),
        "fill_price": None, "exit_price": None, "realized": None,
        "max_loss_at_stop": round(max_loss(o, cfg), 2) if max_loss(o, cfg) is not None else None,
        "note": "",
    }


def cmd_result(args, cfg, now):
    orders = load_orders()
    o = pick(orders, args.index)
    entry = base_entry(o, args.status, now, cfg)
    if args.qty is not None:
        if args.qty <= 0:
            raise psx.PsxError("--qty must be more than 0.")
        entry["qty"] = float(args.qty)
    if args.exit is not None and args.fill is None:
        raise psx.PsxError("--exit needs --fill (the price you bought at) to work out the result.")
    for name in ("fill", "exit"):
        v = getattr(args, name)
        if v is not None and v <= 0:
            raise psx.PsxError("--%s must be a price above 0." % name)
    if args.status in ("cancelled", "denied") and (args.fill is not None or args.exit is not None):
        raise psx.PsxError("A %s order has no fill. Leave out --fill and --exit." % args.status)
    entry["fill_price"] = args.fill
    entry["exit_price"] = args.exit
    if args.fill is not None and args.exit is not None:
        entry["realized"] = realized(entry["qty"], args.fill, args.exit, cfg)
    entry["note"] = args.note or ""
    confirmed = any(r.get("id") == o.get("id") and r.get("status") == "ticket" for r in load_log()["orders"])
    append_log(entry)
    print("Logged ticket %d (%s): %s." % (args.index, entry["symbol"], args.status))
    if args.fill is not None:
        print("  bought %s at %s" % ("{:,}".format(int(entry["qty"])), psx.rs(args.fill)))
    if args.exit is not None:
        print("  sold at %s" % psx.rs(args.exit))
        word = "profit" if entry["realized"] >= 0 else "loss"
        print("  realized %s: %s after PSX charges both sides (before capital gains tax)" % (word, psx.rs(entry["realized"])))
    if not confirmed:
        print("  note: there was no recorded yes for this ticket before this result.")
    return 0


def cmd_log(args, cfg, now):
    day = args.date or now.strftime("%Y-%m-%d")
    rows = [r for r in load_log()["orders"] if str(r.get("at", ""))[:10] == day]
    if not rows:
        print("No ticket decisions logged on %s." % day)
        return 0
    print("Ticket log for %s (trader/state/broker.json):" % day)
    print(psx.table(rows, [
        ("time", lambda r: str(r.get("at", ""))[11:16]), ("symbol", "symbol"), ("status", "status"),
        ("qty", lambda r: "{:,}".format(int(r["qty"])) if r.get("qty") else "-"),
        ("limit", lambda r: "%.2f" % r["limit"] if r.get("limit") else "-"),
        ("fill", lambda r: "%.2f" % r["fill_price"] if r.get("fill_price") else "-"),
        ("exit", lambda r: "%.2f" % r["exit_price"] if r.get("exit_price") else "-"),
        ("realized", lambda r: psx.rs(r["realized"]) if r.get("realized") is not None else "-"),
    ]))
    total = sum(r["realized"] for r in rows if r.get("realized") is not None)
    print("Realized today: %s after charges (before capital gains tax)." % psx.rs(total))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="PSX order tickets. Never sends an order: you enter it in your broker's app.")
    ap.add_argument("--now", help="pretend it is this Pakistan time (YYYY-MM-DD HH:MM)")
    sub = ap.add_subparsers(dest="cmd")
    s = sub.add_parser("show", help="print every ticket, READY or NOT READY")
    s.add_argument("--index", type=int)
    c = sub.add_parser("confirm", help="record the user's yes for one ticket")
    c.add_argument("--index", type=int, required=True)
    c.add_argument("--reply", help="the user's reply, word for word")
    r = sub.add_parser("result", help="log what happened in the broker app (append only)")
    r.add_argument("--index", type=int, required=True)
    r.add_argument("--status", choices=STATUSES, required=True)
    r.add_argument("--fill", type=float, help="price you bought at")
    r.add_argument("--exit", type=float, help="price you sold at")
    r.add_argument("--qty", type=float, help="shares actually filled, if not the ticket quantity")
    r.add_argument("--note")
    lg = sub.add_parser("log", help="today's decisions")
    lg.add_argument("--date")
    args = ap.parse_args(argv)
    now = psx.parse_pkt(args.now) if args.now else psx.now_pkt()
    cfg = psx.load_config()
    handlers = {"show": cmd_show, "confirm": cmd_confirm, "result": cmd_result, "log": cmd_log}
    if args.cmd not in handlers:
        ap.print_help()
        return 1
    return handlers[args.cmd](args, cfg, now)


if __name__ == "__main__":
    psx.run(main)
