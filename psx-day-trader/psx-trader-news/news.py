#!/usr/bin/env python3
"""psx-trader-news: headlines for PSX stocks, the market, and PSX announcements.

  python3 psx-trader-news/news.py --tickers OGDC,HUBC --hours 24
  python3 psx-trader-news/news.py --tickers OGDC --announcements --write
  python3 psx-trader-news/news.py --market --hours 12
  python3 psx-trader-news/news.py                 # scan.json + plan.json + portfolio.json symbols

Headlines come from the PSX Tracker news feed (publisher RSS: Business Recorder,
Dawn, The Express Tribune and others). Matching is literal whole-word title
matching: a match is not proof a story is about the company, and a headline
is never proof of why a price moved.
"""
import argparse
import datetime as _dt
import html as _html
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

# Short forms the press uses that are not the PSX symbol or the Market Watch name.
# Add your own in trader/config.json: "news_aliases": {"SYMBOL": ["name", ...]}.
ALIASES = {
    "OGDC": ["OGDCL", "Oil and Gas Development", "Oil & Gas Development"],
    "PPL": ["Pakistan Petroleum"],
    "MARI": ["Mari Petroleum", "Mari Energies", "Mari Gas"],
    "POL": ["Pakistan Oilfields"],
    "PSO": ["Pakistan State Oil"],
    "HUBC": ["HUBCO", "Hub Power"],
    "KEL": ["K-Electric", "KE"],
    "SNGP": ["SNGPL", "Sui Northern"],
    "SSGC": ["SSGCL", "Sui Southern"],
    "LUCK": ["Lucky Cement"],
    "DGKC": ["DG Khan Cement", "D.G. Khan Cement", "DGKCC"],
    "MLCF": ["Maple Leaf Cement"],
    "FCCL": ["Fauji Cement"],
    "ENGRO": ["Engro Corporation", "Engro Corp", "Engro Holdings"],
    "EFERT": ["Engro Fertilizers", "Engro Fertilisers"],
    "FFC": ["Fauji Fertilizer", "Fauji Fertiliser"],
    "FATIMA": ["Fatima Fertilizer"],
    "HBL": ["Habib Bank"],
    "UBL": ["United Bank"],
    "MCB": ["MCB Bank"],
    "MEBL": ["Meezan Bank"],
    "NBP": ["National Bank of Pakistan"],
    "BAFL": ["Bank Alfalah"],
    "BAHL": ["Bank AL Habib"],
    "BOP": ["Bank of Punjab"],
    "SYS": ["Systems Limited", "Systems Ltd"],
    "TRG": ["TRG Pakistan"],
    "PTC": ["PTCL"],
    "ATRL": ["Attock Refinery"],
    "NRL": ["National Refinery"],
    "PRL": ["Pakistan Refinery"],
    "CNERGY": ["Cnergyico"],
    "PAEL": ["Pak Elektron", "PEL"],
    "INDU": ["Indus Motor", "Toyota Indus"],
    "HCAR": ["Honda Atlas Cars"],
    "MTL": ["Millat Tractors"],
    "SEARL": ["Searle"],
    "ILP": ["Interloop"],
    "PIAHCLA": ["PIA", "Pakistan International Airlines"],
    "PAKT": ["Pakistan Tobacco"],
    "NESTLE": ["Nestle Pakistan"],
}

# Market-wide headlines (whole words, case-insensitive).
MARKET_TERMS = ["KSE-100", "KSE100", "KSE-30", "KMI-30", "PSX", "stock market", "bourse", "SBP", "State Bank",
                "IMF", "policy rate", "monetary policy", "interest rate", "inflation", "CPI", "budget", "rupee",
                "forex reserves", "foreign exchange reserves", "circular debt", "SECP", "FBR", "T-bill", "PIB",
                "Eurobond", "remittances", "current account"]

CATALYSTS = [
    ("results", r"results?|earnings|profit|loss|EPS|revenue|sales|quarter(?:ly)?|half[- ]year(?:ly)?|annual accounts|financial statements"),
    ("payout", r"dividend|payout|cash dividend|interim dividend|final dividend|book closure"),
    ("board meeting", r"board meeting|board of directors|BoD|AGM|EOGM|general meeting"),
    ("rights/bonus", r"rights? (?:issue|shares|offer)|bonus (?:issue|shares)|right shares"),
    ("merger/acquisition", r"merger|merge|acquisition|acquire[sd]?|takeover|buyout|amalgamation|stake (?:sale|purchase)|divest\w*"),
    ("policy/IMF/SBP", r"IMF|SBP|State Bank|policy rate|monetary policy|interest rates?|rate cut|rate hike|budget|tax(?:es|ation)?|FBR"),
    ("circular debt", r"circular debt|capacity payments?|IPPs?"),
    ("oil/gas price", r"oil prices?|crude|Brent|OPEC|LNG|gas prices?|gas tariff|petrol(?:eum)? prices?|fuel prices?"),
    ("discovery/production", r"discover(?:y|ies|ed)|reserves|production|output"),
    ("rating", r"credit rating|ratings?|PACRA|VIS|upgrade[sd]?|downgrade[sd]?"),
    ("default/court", r"default|court|lawsuit|petition|NAB|FIA|penalty|penalties|suspend(?:ed|s)?|halt(?:ed)?|probe|investigation|tribunal"),
    ("expansion/contract", r"expansion|contract|agreement|MoU|deal|plant|project|commence\w*|launch\w*"),
    ("price/tariff", r"price (?:cut|hike|increase|decrease)s?|cuts? prices|raises? prices|tariffs?"),
]
_CATALYST_RE = [(tag, re.compile(r"(?<![A-Za-z0-9])(?:%s)(?![A-Za-z0-9])" % pat, re.I)) for tag, pat in CATALYSTS]

NAME_SUFFIX = re.compile(r"\b(limited|ltd\.?|company|co\.?|corporation|corp\.?|\(pvt\.?\)|the|\(pref\)|plc|inc\.?)\s*$", re.I)


def tags_for(title):
    return [tag for tag, rx in _CATALYST_RE if rx.search(title or "")]


def core_name(name):
    """'Oil & Gas Development Company Limited' -> 'Oil & Gas Development'."""
    n = re.sub(r"\s+", " ", _html.unescape(name or "")).strip()
    n = re.sub(r"(Right|\(R\d*\))$", "", n).strip()
    prev = None
    while prev != n:
        prev = n
        n = NAME_SUFFIX.sub("", n).strip(" ,.-")
    n = re.sub(r"^the\s+", "", n, flags=re.I)
    return n


def name_terms(symbol, mw_name, cfg):
    """Search terms for a symbol: the symbol, a Market Watch core name, aliases."""
    terms = []
    core = core_name(mw_name) if mw_name else ""
    # A one-word core name ("Systems") is too common to match on its own.
    if core and len(core.split()) >= 2:
        terms.append(core)
        if "&" in core:
            terms.append(core.replace("&", "and"))
    terms += ALIASES.get(symbol, [])
    terms += (cfg.get("news_aliases") or {}).get(symbol, [])
    out = []
    for t in terms:
        if t and t.lower() not in [o.lower() for o in out] and t.upper() != symbol:
            out.append(t)
    return out


def word_rx(term, case=False):
    pat = r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % re.escape(term).replace(r"\ ", r"\s+")
    return re.compile(pat, 0 if case else re.I)


def matcher(symbol, terms):
    """Symbol matches only in capitals (so 'POL' does not match 'pol'); names ignore case.
    Short all-capital aliases (OGDCL, KE) also match only in capitals."""
    rxs = [(symbol, word_rx(symbol, case=True))]
    for t in terms:
        rxs.append((t, word_rx(t, case=t.isupper() and len(t) <= 6)))

    def match(title):
        return [t for t, rx in rxs if rx.search(title or "")]
    return match


def parse_iso(text):
    if not text:
        return None
    try:
        d = _dt.datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None
    return d.replace(tzinfo=_dt.timezone.utc).astimezone(psx.PKT)


def window(items, now, hours):
    start = now - _dt.timedelta(hours=hours)
    out = []
    for it in items:
        t = parse_iso(it.get("publishedAt") or it.get("indexedAt"))
        if t is None or t < start or t > now:
            continue
        out.append((t, it))
    out.sort(key=lambda x: x[0], reverse=True)
    return out


FOREIGN = re.compile(r"(?<![A-Za-z])(India|Indian|Thai|Thailand|China|Chinese|Japan|Japanese|Korea|Korean|Sri Lanka|Bangladesh|Malaysia|Indonesia|Philippine|Vietnam|Taiwan|Fed|ECB|Bank of England|Britain|UK|Europe|European|Wall Street|Nikkei|S&P|Nasdaq|Dow)(?![A-Za-z])")
PAKISTAN = re.compile(r"(?<![A-Za-z])(Pakistan|PSX|KSE|SBP|State Bank|PKR)(?![A-Za-z])")
NOT_MARKET_CATEGORIES = {"world", "crypto", "sports", "life-style", "technology"}


def is_market(it, rxs):
    """Pakistan market-wide headline: a market term, not a foreign-market story."""
    title = it.get("title") or ""
    if it.get("region") == "Global" or it.get("category") in NOT_MARKET_CATEGORIES:
        return False
    if not any(rx.search(title) for rx in rxs):
        return False
    return not (FOREIGN.search(title) and not PAKISTAN.search(title))


def headline(t, it, matched=None):
    row = {"title": psx.strip_tags(it.get("title")), "url": it.get("url"), "source": it.get("source") or it.get("sourceDomain"),
           "published": t.strftime("%Y-%m-%d %H:%M PKT"), "tags": tags_for(it.get("title"))}
    if matched is not None:
        row["matched"] = matched
    return row


# ---------------------------------------------------------------- PSX announcements (company page)

ANN_TABS = ("Financial Results", "Board Meetings", "Others")


def announcements(html):
    """[{date (YYYY-MM-DD), date_text, tab, title, url}] from the company page, newest first."""
    sec = re.search(r'id="announcements"(.*?)(?:id="financials"|$)', html, re.S)
    if not sec:
        return []
    body = sec.group(1)
    out, seen = [], set()
    panels = re.split(r'<div class="tabs__panel" data-name="', body)[1:]
    for panel in panels:
        tab = panel.split('"', 1)[0]
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", panel, re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
            if len(cells) < 2:
                continue
            date_text = psx.strip_tags(cells[0])
            title = psx.strip_tags(cells[1])
            try:
                day = _dt.datetime.strptime(date_text, "%b %d, %Y").strftime("%Y-%m-%d")
            except ValueError:
                day = None
            pdf = re.search(r'href="([^"]*download/document/[^"]+)"', tr)
            img = re.search(r'data-images="([^"]+)"', tr)
            url = ""
            if pdf:
                url = pdf.group(1) if pdf.group(1).startswith("http") else "https://dps.psx.com.pk" + pdf.group(1)
            elif img:
                url = "https://dps.psx.com.pk/download/image/" + img.group(1).split(",")[0]
            key = url or "%s|%s" % (date_text, title)
            if key in seen:
                continue
            seen.add(key)
            out.append({"date": day, "date_text": date_text, "tab": tab, "title": title, "url": url,
                        "revoked": "REVOKED" in title.upper()})
    out.sort(key=lambda a: a["date"] or "", reverse=True)
    return out


# ---------------------------------------------------------------- symbols


def default_symbols():
    syms = []
    scan = psx.read_json(psx.path("scan.json"), "scan", required=False) or {}
    syms += [r.get("symbol") for r in scan.get("results") or []]
    plan = psx.read_json(psx.path("plan.json"), "plan", required=False) or {}
    syms.append(plan.get("symbol"))
    port = psx.read_json(psx.path("portfolio.json"), "portfolio", required=False) or {}
    syms += [p.get("symbol") for p in port.get("positions") or []]
    out = []
    for s in syms:
        if s and psx.clean_symbol(s) not in out:
            out.append(psx.clean_symbol(s))
    return out


def market_names(cfg):
    try:
        return {r["symbol"]: r for r in psx.market_watch(cfg)}
    except psx.PsxError:
        return {}


# ---------------------------------------------------------------- main


def run(args, cfg, now):
    syms = []
    for v in args.tickers or []:
        syms += [psx.clean_symbol(s) for s in re.split(r"[,\s]+", v) if s]
    if not syms and not args.market:
        syms = default_symbols()
        if not syms:
            raise psx.PsxError("No symbols. Use --tickers OGDC,HUBC or --market (or keep scan.json, plan.json or portfolio.json).")
    data = psx.feed("news", cfg)
    items = data.get("items") or []
    recent = window(items, now, args.hours)
    out = {"as_of": now.strftime("%Y-%m-%d %H:%M PKT"), "hours": args.hours,
           "source": "PSX Tracker news feed (%s), checked %s" % (data.get("provider") or "publisher RSS",
                                                                 (parse_iso(data.get("checkedAt")) or now).strftime("%Y-%m-%d %H:%M PKT")),
           "feed_items": len(items), "in_window": len(recent), "partial": bool(data.get("partial")),
           "stale": bool(data.get("stale")), "failed_feeds": data.get("failedFeeds") or [], "tickers": {}}
    print("News for the last %d hours to %s (%d headlines in the feed window)." % (args.hours, out["as_of"], len(recent)))
    if out["stale"] or out["partial"] or out["failed_feeds"]:
        print("Warning: the news feed is %s; some publishers may be missing." % ", ".join(
            w for w, on in (("stale", out["stale"]), ("partial", out["partial"]), ("missing feeds", bool(out["failed_feeds"]))) if on))

    mw = market_names(cfg) if syms else {}
    for sym in syms:
        row = mw.get(sym)
        terms = name_terms(sym, row.get("name") if row else "", cfg)
        match = matcher(sym, terms)
        heads = []
        for t, it in recent:
            m = match(it.get("title"))
            if m:
                heads.append(headline(t, it, m))
        entry = {"name": row.get("name") if row else None, "terms": [sym] + terms, "headlines": heads}
        if row and row.get("change_pct") is not None:
            entry["last"] = {"price": row.get("current"), "change_pct": row.get("change_pct")}
        print()
        title = "%s%s" % (sym, " - %s" % row["name"] if row else "")
        print(title)
        print("  searched for: %s" % ", ".join(entry["terms"]))
        if "last" in entry:
            print("  Market Watch: %.2f (%+.2f%%). Headlines below are not the reason for this move." % (entry["last"]["price"], entry["last"]["change_pct"]))
        if not heads:
            print("  No matching headlines in the last %d hours." % args.hours)
        for h in heads:
            print("  %s  %s  [%s]%s" % (h["published"][5:16], h["title"], h["source"], "  {%s}" % ", ".join(h["tags"]) if h["tags"] else ""))
            print("      %s" % h["url"])
        if args.announcements:
            try:
                anns = announcements(psx.company_page(sym, cfg))
            except psx.PsxError as e:
                anns = []
                print("  PSX announcements: could not read the company page (%s)" % e)
            entry["announcements"] = anns
            if anns:
                print("  PSX announcements (company page, latest per tab):")
                for a in anns:
                    print("    %s  %-17s %s%s" % (a["date"] or a["date_text"], a["tab"], a["title"], "" if not a["url"] else "  " + a["url"]))
        out["tickers"][sym] = entry

    if args.market:
        mrx = [word_rx(t, case=t.isupper() and len(t) <= 6) for t in MARKET_TERMS]
        heads = [headline(t, it) for t, it in recent if is_market(it, mrx)]
        out["market"] = heads
        print()
        print("Market-wide (KSE-100, PSX, SBP, IMF, rupee, inflation, budget):")
        if not heads:
            print("  No market headlines in the last %d hours." % args.hours)
        for h in heads[:args.limit]:
            print("  %s  %s  [%s]" % (h["published"][5:16], h["title"], h["source"]))
        if len(heads) > args.limit:
            print("  ... and %d more (use --limit or --write)." % (len(heads) - args.limit))

    print()
    print("Matching is by whole words in titles only. A headline next to a price move does not mean it caused the move.")
    if args.write:
        p = psx.write_json(psx.path("news.json"), out)
        print("Wrote %s." % p)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="PSX news headlines and announcements. Headline matching is not causation.")
    ap.add_argument("--tickers", nargs="*", help="symbols, e.g. OGDC,HUBC")
    ap.add_argument("--hours", type=int, default=24)
    ap.add_argument("--market", action="store_true", help="market-wide headlines (KSE-100, SBP, IMF...)")
    ap.add_argument("--announcements", action="store_true", help="also PSX company announcements from each company page")
    ap.add_argument("--limit", type=int, default=25, help="max market headlines printed")
    ap.add_argument("--write", action="store_true", help="write trader/news.json")
    ap.add_argument("--now", help="pretend it is this Pakistan time (YYYY-MM-DD HH:MM)")
    args = ap.parse_args(argv)
    if args.hours <= 0:
        raise psx.PsxError("--hours must be more than 0.")
    now = psx.parse_pkt(args.now) if args.now else psx.now_pkt()
    run(args, psx.load_config(), now)
    return 0


if __name__ == "__main__":
    psx.run(main)
