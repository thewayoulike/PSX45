#!/usr/bin/env python3
"""psx-trader-insiders: public PSX insider-trade disclosures.

Directors, the CEO, executives, their spouses and substantial shareholders of a
PSX company must disclose when they buy or sell its shares. The PSX Tracker
insiders feed collects those disclosures. This reads them; it is not inside
information and not advice.

  python3 psx-trader-insiders/insiders.py latest --days 30
  python3 psx-trader-insiders/insiders.py latest --action Buy --min-value 1000000
  python3 psx-trader-insiders/insiders.py symbol DGKC
  python3 psx-trader-insiders/insiders.py cluster --days 30 --write
"""
import argparse
import datetime as _dt
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402


def norm_action(raw):
    a = re.sub(r"[\s_-]+", " ", str(raw or "")).strip().lower()
    if a == "buy":
        return "Buy"
    if a == "sell":
        return "Sell"
    return "Other"


def person_key(name):
    return re.sub(r"[^a-z]", "", re.sub(r"^(mr|mrs|ms|miss|dr|syed|syeda)\.?\s+", "", str(name or "").strip().lower()))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def load(cfg):
    data = psx.feed("insiders", cfg)
    seen, rows = set(), []
    for r in data.get("records") or []:
        key = r.get("id") or "%s|%s|%s|%s|%s" % (r.get("symbol"), r.get("date"), r.get("person"), r.get("action"), r.get("shares"))
        if key in seen:
            continue
        seen.add(key)
        rows.append(dict(r, symbol=str(r.get("symbol") or "").upper(), kind=norm_action(r.get("action")),
                         shares=num(r.get("shares")), price=num(r.get("price")), value=num(r.get("value"))))
    rows.sort(key=lambda r: (r.get("date") or "", r.get("value") or 0), reverse=True)
    return data, rows


def coverage(data, rows):
    failed = data.get("failed") or []
    first = min((r["date"] for r in rows if r.get("date")), default=None)
    last = max((r["date"] for r in rows if r.get("date")), default=None)
    return {"as_of": data.get("asOf"), "updated_at": data.get("updatedAt"), "source": data.get("sourceUrl"),
            "coverage": data.get("coverage"), "companies": data.get("companies"), "checked": data.get("checked"),
            "failed": len(failed), "failed_symbols": [f.get("symbol") if isinstance(f, dict) else f for f in failed][:50],
            "records": len(rows), "first_date": first, "last_date": last}


def coverage_text(c):
    lines = ["Source: PSX insider disclosures, collected by the PSX Tracker feed from %s, as of %s." % (c["source"] or "PSX filings", c["as_of"] or "?")]
    lines.append("%d records from %s to %s. %s" % (c["records"], c["first_date"] or "?", c["last_date"] or "?", c["coverage"] or ""))
    if c["companies"]:
        lines.append("Checked %s of %s companies; %d could not be read%s." % (
            c["checked"], c["companies"], c["failed"], " (e.g. %s)" % ", ".join(str(s) for s in c["failed_symbols"][:8]) if c["failed"] else ""))
    lines.append("A company missing here may simply not have been read. Always open the filing (link) to check.")
    return "\n".join(lines)


def in_window(rows, now, days):
    start = (now - _dt.timedelta(days=days)).strftime("%Y-%m-%d")
    end = now.strftime("%Y-%m-%d")
    return [r for r in rows if r.get("date") and start <= r["date"] <= end]


def money(v):
    return "-" if v is None else "{:,.0f}".format(v)


COLS = [
    ("date", "date"), ("symbol", "symbol"), ("person", lambda r: str(r.get("person") or "")[:28]),
    ("role", lambda r: str(r.get("role") or "")[:24]), ("action", "action"),
    ("shares", lambda r: money(r.get("shares"))), ("price", lambda r: "%.2f" % r["price"] if r.get("price") else "-"),
    ("value Rs", lambda r: money(r.get("value"))),
]


def public(r):
    keep = ("id", "symbol", "company", "date", "person", "role", "action", "kind", "shares", "price", "value", "sourceUrl")
    return {k: r.get(k) for k in keep}


def totals(rows):
    buys = [r for r in rows if r["kind"] == "Buy"]
    sells = [r for r in rows if r["kind"] == "Sell"]
    b = sum(r.get("value") or 0 for r in buys)
    s = sum(r.get("value") or 0 for r in sells)
    return {"buys": len(buys), "sells": len(sells), "other": len(rows) - len(buys) - len(sells),
            "shares_bought": sum(r.get("shares") or 0 for r in buys), "shares_sold": sum(r.get("shares") or 0 for r in sells),
            "value_bought": b, "value_sold": s, "net_value": b - s,
            "people": len({person_key(r.get("person")) for r in rows if r.get("person")}),
            "buyers": len({person_key(r.get("person")) for r in buys if r.get("person")}),
            "sellers": len({person_key(r.get("person")) for r in sells if r.get("person")})}


def cmd_latest(args, rows, now):
    sel = in_window(rows, now, args.days)
    if args.symbol:
        sel = [r for r in sel if r["symbol"] == psx.clean_symbol(args.symbol)]
    if args.action:
        sel = [r for r in sel if r["kind"] == args.action]
    if args.min_value:
        sel = [r for r in sel if (r.get("value") or 0) >= args.min_value]
    print("Insider disclosures in the last %d days to %s%s:" % (args.days, now.strftime("%Y-%m-%d"),
                                                               "".join(" (%s)" % x for x in (args.symbol, args.action) if x)))
    if not sel:
        print("  None found.")
    else:
        print(psx.table(sel[:args.limit], COLS))
        if len(sel) > args.limit:
            print("... and %d more (use --limit or --write)." % (len(sel) - args.limit))
    t = totals(sel)
    print("Buys: %d (Rs %s). Sells: %d (Rs %s). Other (gifts, bonus, rights, inheritance...): %d." % (
        t["buys"], money(t["value_bought"]), t["sells"], money(t["value_sold"]), t["other"]))
    return {"query": {"command": "latest", "days": args.days, "symbol": args.symbol, "action": args.action, "min_value": args.min_value},
            "totals": t, "records": [public(r) for r in sel]}


def cmd_symbol(args, rows, now):
    sym = psx.clean_symbol(args.symbol)
    sel = [r for r in rows if r["symbol"] == sym]
    if args.days:
        sel = in_window(sel, now, args.days)
    company = next((r.get("company") for r in sel if r.get("company")), sym)
    print("%s - %s: every disclosure in the feed%s." % (sym, company, " (last %d days)" % args.days if args.days else ""))
    if not sel:
        print("  None in the feed. That does not mean none were filed: check the PSX company page announcements.")
    else:
        print(psx.table(sel, COLS))
    t = totals(sel)
    print("Bought: %s shares, Rs %s by %d person(s). Sold: %s shares, Rs %s by %d person(s)." % (
        money(t["shares_bought"]), money(t["value_bought"]), t["buyers"], money(t["shares_sold"]), money(t["value_sold"]), t["sellers"]))
    print("Net (bought minus sold): Rs %s. %d different people. %d other transfers (gifts, bonus, rights...)." % (
        money(t["net_value"]), t["people"], t["other"]))
    by_person = {}
    for r in sel:
        k = person_key(r.get("person"))
        p = by_person.setdefault(k, {"person": r.get("person"), "role": r.get("role"), "bought": 0.0, "sold": 0.0, "filings": 0})
        p["filings"] += 1
        if r["kind"] == "Buy":
            p["bought"] += r.get("value") or 0
        elif r["kind"] == "Sell":
            p["sold"] += r.get("value") or 0
    people = sorted(by_person.values(), key=lambda p: -(p["bought"] + p["sold"]))
    if people:
        print("By person:")
        print(psx.table(people, [("person", lambda p: str(p["person"])[:30]), ("role", lambda p: str(p["role"] or "")[:26]),
                                 ("filings", "filings"), ("bought Rs", lambda p: money(p["bought"])), ("sold Rs", lambda p: money(p["sold"]))]))
    return {"query": {"command": "symbol", "symbol": sym, "days": args.days}, "company": company, "totals": t,
            "people": people, "records": [public(r) for r in sel]}


def cmd_cluster(args, rows, now):
    sel = in_window(rows, now, args.days)
    groups = {}
    for r in sel:
        groups.setdefault(r["symbol"], []).append(r)
    clusters = []
    for sym, rs_ in groups.items():
        buys = [r for r in rs_ if r["kind"] == "Buy"]
        buyers = {person_key(r.get("person")): r.get("person") for r in buys if r.get("person")}
        if len(buyers) < args.min_people:
            continue
        t = totals(rs_)
        clusters.append({"symbol": sym, "company": next((r.get("company") for r in rs_ if r.get("company")), sym),
                         "buyers": sorted(buyers.values()), "buys": t["buys"], "shares_bought": t["shares_bought"],
                         "value_bought": t["value_bought"], "sells": t["sells"], "value_sold": t["value_sold"],
                         "first": min(r["date"] for r in buys), "last": max(r["date"] for r in buys),
                         "records": [public(r) for r in rs_]})
    clusters.sort(key=lambda c: (-len(c["buyers"]), -c["value_bought"]))
    print("Cluster buying: companies where %d or more different insiders bought in the last %d days (to %s)." % (args.min_people, args.days, now.strftime("%Y-%m-%d")))
    if not clusters:
        print("  None found.")
    else:
        print(psx.table(clusters, [
            ("symbol", "symbol"), ("buyers", lambda c: len(c["buyers"])), ("buys", "buys"),
            ("shares", lambda c: money(c["shares_bought"])), ("bought Rs", lambda c: money(c["value_bought"])),
            ("sold Rs", lambda c: money(c["value_sold"])), ("dates", lambda c: "%s to %s" % (c["first"], c["last"])),
            ("who", lambda c: ", ".join(c["buyers"])[:60]),
        ]))
    print("Several insiders buying is a public fact worth reading about, not a signal that the price will rise.")
    return {"query": {"command": "cluster", "days": args.days, "min_people": args.min_people}, "clusters": clusters}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Public PSX insider disclosures (directors, executives, substantial shareholders). Not advice.")
    ap.add_argument("--now", help="pretend it is this Pakistan time (YYYY-MM-DD HH:MM)")
    ap.add_argument("--write", action="store_true", help="write trader/insiders.json")
    sub = ap.add_subparsers(dest="cmd")
    l = sub.add_parser("latest", help="recent disclosures")
    l.add_argument("--days", type=int, default=30)
    l.add_argument("--symbol")
    l.add_argument("--action", choices=("Buy", "Sell"))
    l.add_argument("--min-value", type=float, default=0, help="Rs value at least this")
    l.add_argument("--limit", type=int, default=40)
    s = sub.add_parser("symbol", help="every disclosure for one company")
    s.add_argument("symbol")
    s.add_argument("--days", type=int, default=0, help="only the last N days (default: all)")
    c = sub.add_parser("cluster", help="companies where 2+ insiders bought")
    c.add_argument("--days", type=int, default=30)
    c.add_argument("--min-people", type=int, default=2)
    for p in (l, s, c):
        p.add_argument("--write", action="store_true", default=argparse.SUPPRESS, help="write trader/insiders.json")
    args = ap.parse_args(argv)
    handlers = {"latest": cmd_latest, "symbol": cmd_symbol, "cluster": cmd_cluster}
    if args.cmd not in handlers:
        ap.print_help()
        return 1
    now = psx.parse_pkt(args.now) if args.now else psx.now_pkt()
    data, rows = load(psx.load_config())
    result = handlers[args.cmd](args, rows, now)
    cov = coverage(data, rows)
    print()
    print(coverage_text(cov))
    print("These are public disclosures filed with PSX, published days after the trade. Not inside information, not advice.")
    if args.write:
        out = dict({"as_of": now.strftime("%Y-%m-%d %H:%M PKT"), "coverage": cov}, **result)
        p = psx.write_json(psx.path("insiders.json"), out)
        print("Wrote %s." % p)
    return 0


if __name__ == "__main__":
    psx.run(main)
