#!/usr/bin/env python3
"""psx-trader-analyst: what the PSX company page says about a company's results.

  python3 psx-trader-analyst/facts.py OGDC
  python3 psx-trader-analyst/facts.py OGDC,PPL --write
  python3 psx-trader-analyst/facts.py OGDC --json

Reads the Financials (Annual and Quarterly), Ratios and Payouts tables on the
PSX company page (data by Capital Stake, standardized, through your PSX Tracker
server). Amounts are Rs in thousands; EPS is Rs per share. Changes are worked
out only between like periods (a year against the year before; a quarter
against the same quarter a year earlier, or the quarter just before). No
percentage is given from a zero or negative base. No verdicts.
"""
import argparse
import datetime as _dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

KEY_METRICS = [
    ("sales", r"^(sales|revenue|net sales|turnover)$"),
    ("total_income", r"^total income$"),
    ("profit_after_tax", r"^(profit after taxation|profit after tax|net profit|profit/\(loss\) after taxation)$"),
    ("eps", r"^(eps|earnings per share)$"),
]


def section(html, sid, next_ids):
    m = re.search(r'id="%s"[^>]*>(.*?)(?:%s|$)' % (sid, "|".join('id="%s"' % n for n in next_ids)), html, re.S)
    return m.group(1) if m else ""


def cells(tr):
    return [psx.strip_tags(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]


def read_table(html):
    rows = [cells(tr) for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)]
    return [r for r in rows if r]


def number(text):
    """'449,190,752' -> 449190752.0, '(18.71)' -> -18.71, '-' -> None."""
    t = (text or "").replace(",", "").replace("Rs.", "").replace("%", "").strip()
    neg = t.startswith("(") and t.endswith(")")
    t = t.strip("()").strip()
    if not re.match(r"^-?\d+(\.\d+)?$", t):
        return None
    v = float(t)
    return -v if neg else v


def metric_table(rows, period_rx):
    """Header row of periods + metric rows. Returns {periods, rows: {label: [values]}} or None."""
    if not rows or len(rows[0]) < 2:
        return None
    periods = rows[0][1:]
    if not periods or not all(re.match(period_rx, p) for p in periods):
        return None
    out = {}
    for r in rows[1:]:
        if len(r) == len(periods) + 1 and r[0]:
            out[r[0]] = [number(v) for v in r[1:]]
    return {"periods": periods, "rows": out}


def panel(sec, name):
    m = re.search(r'class="tabs__panel" data-name="%s"(.*?)(?:class="tabs__panel"|$)' % re.escape(name), sec, re.S)
    return m.group(1) if m else ""


def key_rows(table):
    """Map the standard metrics onto whatever labels PSX used."""
    out = {}
    for key, rx in KEY_METRICS:
        label = next((l for l in table["rows"] if re.match(rx, l.strip(), re.I)), None)
        if label:
            out[key] = {"label": label, "values": table["rows"][label]}
    return out


def parse_company(html):
    fin = section(html, "financials", ["ratios", "payouts", "reports"])
    units_ok = bool(re.search(r"thousands|000'?s", psx.strip_tags(fin), re.I))
    annual = metric_table(read_table(panel(fin, "Annual")), r"^\d{4}$")
    quarterly = metric_table(read_table(panel(fin, "Quarterly")), r"^Q[1-4]\s+\d{4}$")
    ratios = metric_table(read_table(section(html, "ratios", ["payouts", "reports"])), r"^\d{4}$")
    payout_rows = read_table(section(html, "payouts", ["reports"]))
    payouts = []
    if payout_rows and len(payout_rows) > 1:
        head = payout_rows[0]
        for r in payout_rows[1:]:
            payouts.append(dict(zip([h or "col%d" % i for i, h in enumerate(head)], r)) if len(r) == len(head) else {"row": r})
    profile = psx.strip_tags(section(html, "profile", ["equity", "announcements"]))
    fye = re.search(r"Fiscal Year End\s+([A-Z][a-z]+)", profile)
    name = re.search(r'class="quote__name"[^>]*>(.*?)</div>', html, re.S)
    sector = re.search(r'class="quote__sector"[^>]*>(.*?)</div>', html, re.S)
    results = [a for a in announcements(html) if a["tab"] == "Financial Results"]
    return {"name": psx.strip_tags(name.group(1)) if name else None, "sector": psx.strip_tags(sector.group(1)) if sector else None,
            "fiscal_year_end": fye.group(1) if fye else None,
            "units_ok": units_ok, "annual": annual, "quarterly": quarterly, "ratios": ratios, "payouts": payouts,
            "results_announcements": results[:3]}


def announcements(html):
    """Financial results announcements (date, title, link) from the company page."""
    sec = section(html, "announcements", ["financials"])
    out = []
    for part in re.split(r'<div class="tabs__panel" data-name="', sec)[1:]:
        tab = part.split('"', 1)[0]
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", part, re.S):
            c = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
            if len(c) < 2:
                continue
            date_text = psx.strip_tags(c[0])
            try:
                day = _dt.datetime.strptime(date_text, "%b %d, %Y").strftime("%Y-%m-%d")
            except ValueError:
                day = None
            pdf = re.search(r'href="([^"]*download/document/[^"]+)"', tr)
            out.append({"date": day, "tab": tab, "title": psx.strip_tags(c[1]),
                        "url": ("https://dps.psx.com.pk" + pdf.group(1)) if pdf and pdf.group(1).startswith("/") else (pdf.group(1) if pdf else "")})
    return out


# ---------------------------------------------------------------- changes between like periods


def quarter_key(label):
    m = re.match(r"^Q([1-4])\s+(\d{4})$", label)
    return (int(m.group(2)), int(m.group(1))) if m else None


def change(metric, kind, newer, older, cur, prev):
    row = {"metric": metric, "kind": kind, "from": older, "to": newer, "previous": prev, "current": cur,
           "change": None, "change_pct": None, "note": ""}
    if cur is None or prev is None:
        row["note"] = "missing value"
        return row
    row["change"] = round(cur - prev, 2)
    if prev > 0:
        row["change_pct"] = round((cur - prev) / prev * 100, 2)
    elif prev == 0:
        row["note"] = "no % change from a zero base"
    else:
        row["note"] = "no % change from a loss (negative base)"
    if prev < 0 <= cur:
        row["note"] = "turned from a loss to a profit; no % change from a negative base"
    elif prev > 0 > cur:
        row["note"] = "turned from a profit to a loss"
    return row


def changes(parsed):
    out = []
    a = parsed.get("annual")
    if a:
        keys = key_rows(a)
        years = [int(p) for p in a["periods"]]
        for i, y in enumerate(years):
            j = next((k for k, yy in enumerate(years) if yy == y - 1), None)
            if j is None:
                continue
            for key, row in keys.items():
                out.append(change(key, "YoY (annual)", str(y), str(y - 1), row["values"][i], row["values"][j]))
    q = parsed.get("quarterly")
    if q:
        keys = key_rows(q)
        qk = [quarter_key(p) for p in q["periods"]]
        for i, (fy, n) in enumerate(qk):
            same = next((k for k, x in enumerate(qk) if x == (fy - 1, n)), None)
            before = (fy, n - 1) if n > 1 else (fy - 1, 4)
            prior = next((k for k, x in enumerate(qk) if x == before), None)
            for key, row in keys.items():
                if same is not None:
                    out.append(change(key, "YoY (same quarter)", q["periods"][i], q["periods"][same], row["values"][i], row["values"][same]))
                if prior is not None:
                    out.append(change(key, "QoQ", q["periods"][i], q["periods"][prior], row["values"][i], row["values"][prior]))
    return out


# ---------------------------------------------------------------- output

NAMES = {"sales": "Sales", "total_income": "Total income", "profit_after_tax": "Profit after tax", "eps": "EPS"}


def fmt(key, v):
    if v is None:
        return "-"
    if key == "eps":
        return "Rs. %.2f" % v
    return "Rs. {:,.0f}k".format(v)


def print_table(title, table, unit_note):
    if not table:
        print("  %s: not on the PSX page." % title)
        return
    print("  %s (%s):" % (title, unit_note))
    rows = [dict({"metric": label}, **{p: ("-" if v is None else ("{:,.2f}".format(v) if abs(v) < 1000 else "{:,.0f}".format(v)))
                                        for p, v in zip(table["periods"], vals)}) for label, vals in table["rows"].items()]
    for line in psx.table(rows, [("", "metric")] + [(p, p) for p in table["periods"]]).splitlines():
        print("    " + line)


def describe_change(c):
    name = NAMES.get(c["metric"], c["metric"])
    if c["change"] is None:
        return "%s %s vs %s: %s." % (name, c["to"], c["from"], c["note"])
    pct = " (%+.1f%%)" % c["change_pct"] if c["change_pct"] is not None else ""
    note = "; %s" % c["note"] if c["note"] else ""
    return "%s %s vs %s: %s vs %s%s%s." % (name, c["to"], c["from"], fmt(c["metric"], c["current"]), fmt(c["metric"], c["previous"]), pct, note)


def analyse(sym, cfg, now):
    parsed = parse_company(psx.company_page(sym, cfg))
    ch = changes(parsed)
    notes = ["Figures are PSX / Capital Stake standardized data and can differ from the company's own report; check the filing (links below)."]
    if not parsed["units_ok"]:
        notes.append("The page did not state 'thousands' for the financials: treat the units as unknown.")
    if parsed["quarterly"]:
        notes.append("Quarters are the company's fiscal quarters as PSX labels them (fiscal year ends %s). PSX shows no Q4: the fourth quarter is inside the annual figure." % (parsed["fiscal_year_end"] or "as stated by the company"))
    if not parsed["annual"] and not parsed["quarterly"]:
        notes.append("No usable Annual or Quarterly table on the PSX page. Check the company's filings.")
    return {"symbol": sym, "name": parsed["name"], "sector": parsed["sector"], "as_of": now.strftime("%Y-%m-%d %H:%M PKT"),
            "source": "PSX company page https://dps.psx.com.pk/company/%s (data by Capital Stake) via PSX Tracker" % sym,
            "units": {"amounts": "Rs in thousands (000s)" if parsed["units_ok"] else "unknown", "eps": "Rs per share"},
            "fiscal_year_end": parsed["fiscal_year_end"], "annual": parsed["annual"], "quarterly": parsed["quarterly"],
            "ratios": parsed["ratios"], "payouts": parsed["payouts"], "results_announcements": parsed["results_announcements"],
            "changes": ch, "notes": notes}


def report(r):
    print("%s%s" % (r["symbol"], " - %s" % r["name"] if r["name"] else ""))
    print("  Source: %s. Amounts %s; EPS %s." % (r["source"], r["units"]["amounts"], r["units"]["eps"]))
    if r["fiscal_year_end"]:
        print("  Fiscal year ends: %s." % r["fiscal_year_end"])
    unit = "Rs thousands, EPS in Rs"
    print_table("Annual", r["annual"], unit)
    print_table("Quarterly", r["quarterly"], unit)
    print_table("Ratios", r["ratios"], "% as shown by PSX; (x) means negative")
    if r["payouts"]:
        print("  Payouts (dividend history):")
        for p in r["payouts"][:8]:
            print("    " + " | ".join(str(v) for v in (p.values() if isinstance(p, dict) else p)))
    else:
        print("  Payouts: none listed on the PSX page.")
    if r["changes"]:
        print("  What changed (like periods only):")
        for c in r["changes"]:
            print("    - " + describe_change(c))
    for a in r["results_announcements"]:
        print("  Results filing: %s %s %s" % (a["date"], a["title"], a["url"]))
    for n in r["notes"]:
        print("  Note: " + n)
    print("  These are reported numbers, not a view on the stock.")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Reported results from the PSX company page. No verdicts.")
    ap.add_argument("symbols", nargs="+", help="e.g. OGDC or OGDC,PPL")
    ap.add_argument("--write", action="store_true", help="write trader/analyst/SYMBOL.json")
    ap.add_argument("--json", action="store_true", help="print JSON instead of text")
    args = ap.parse_args(argv)
    syms = []
    for v in args.symbols:
        syms += [psx.clean_symbol(s) for s in re.split(r"[,\s]+", v) if s]
    cfg, now = psx.load_config(), psx.now_pkt()
    for i, sym in enumerate(syms):
        r = analyse(sym, cfg, now)
        if args.json:
            print(json.dumps(r, indent=2, ensure_ascii=False))
        else:
            if i:
                print()
            report(r)
        if args.write:
            p = psx.write_json(psx.path("analyst", "%s.json" % sym), r)
            if not args.json:
                print("  Wrote %s." % p)
    return 0


if __name__ == "__main__":
    psx.run(main)
