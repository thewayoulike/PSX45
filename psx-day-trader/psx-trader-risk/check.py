#!/usr/bin/env python3
"""Risk Manager for psx-trader-risk. Standard library only, no network unless --quotes.

Checks every order in trader/orders.json against your limits and prints PASS
or BLOCK with plain reasons. Orders are checked in file order as if each passed
order had filled, so a batch that breaks a limit together is caught.

    python3 psx-trader-risk/check.py                     # trader/orders.json, now
    python3 psx-trader-risk/check.py --write             # also write trader/risk.json
    python3 psx-trader-risk/check.py --now "2026-11-06 10:20" --prior-close OGDC=316.24
    python3 psx-trader-risk/check.py --quotes            # read prior closes from PSX Market Watch

Exit code 0 when every order passed, 1 when any was blocked. It never places,
edits or approves an order. There is no US pattern-day-trader rule on PSX.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

LIVE = ("ticket", "placed", "filled")
OPEN = ("placed", "filled")


def costs(cfg):
    return float(cfg.get("fee_pct") or 0), float(cfg.get("slip_pct") or 0), bool(cfg.get("one_side_commission"))


def prices_row(prices, symbol):
    """A symbol's row from trader/prices.json, whatever its exact layout."""
    if not isinstance(prices, dict):
        return None
    for key in ("prices", "quotes"):
        if isinstance(prices.get(key), dict):
            return prices[key].get(symbol)
        if isinstance(prices.get(key), list):
            return next((r for r in prices[key] if str(r.get("symbol", "")).upper() == symbol), None)
    row = prices.get(symbol)
    return row if isinstance(row, dict) else None


def clock(text, day):
    try:
        return psx.ms(psx.parse_pkt("%s %s" % (day, str(text).strip())))
    except psx.PsxError:
        return None


def today_log(broker, today):
    """Latest record per order id from state/broker.json for today."""
    latest = {}
    for o in (broker or {}).get("orders") or []:
        if str(o.get("at", ""))[:10] == today and o.get("id"):
            latest[o["id"]] = o
    return latest


def unit_loss(limit, stop, cfg):
    fee, slip, one = costs(cfg)
    return psx.buy_cost(limit, fee, slip) - psx.sell_proceeds(stop, fee, slip, one)


def day_state(cfg, portfolio, prices, broker, today):
    log = today_log(broker, today)
    trades = [o for o in log.values() if o.get("status") in OPEN]
    realized_loss = sum(-float(o["realized"]) for o in log.values()
                        if isinstance(o.get("realized"), (int, float)) and o["realized"] < 0)
    reserved = 0.0
    open_cost = 0.0
    for o in trades:
        if o.get("exit_price") or isinstance(o.get("realized"), (int, float)):
            continue
        try:
            qty, limit = float(o["qty"]), float(o.get("fill_price") or o["limit"])
            open_cost += qty * psx.buy_cost(limit, *costs(cfg)[:2])
            if o.get("stop"):
                reserved += qty * unit_loss(limit, float(o["stop"]), cfg)
        except (KeyError, TypeError, ValueError):
            continue
    held = {}
    if portfolio and isinstance(portfolio.get("cash"), (int, float)):
        cash = float(portfolio["cash"])
        total = cash
        for p in portfolio.get("positions") or []:
            try:
                sym, qty = str(p["symbol"]).upper(), float(p["qty"])
            except (KeyError, TypeError, ValueError):
                continue
            if qty <= 0:
                continue
            row = prices_row(prices, sym) or {}
            px = row.get("current") or p.get("price") or p.get("avg_price") or 0
            held[sym] = held.get(sym, 0) + qty * float(px)
            total += qty * float(px)
        money_from = "portfolio.json"
    else:
        total = float(cfg.get("capital") or 0)
        cash = total - open_cost
        money_from = "config capital less today's open orders"
    return {"log": log, "trades": len(trades), "realized_loss": realized_loss, "reserved": reserved,
            "cash": cash, "total": total, "held": held, "money_from": money_from,
            "symbols_today": {str(o.get("symbol", "")).upper(): o["id"] for o in log.values() if o.get("status") in LIVE}}


def band_of(order, prices, prior):
    sym = order["symbol"]
    if sym in prior:
        return psx.price_band(prior[sym]), "prior close %.2f you gave" % prior[sym]
    row = prices_row(prices, sym)
    if row and row.get("ldcp"):
        return psx.price_band(float(row["ldcp"])), "ldcp %.2f from prices.json" % float(row["ldcp"])
    b = order.get("band")
    if isinstance(b, dict) and b.get("lower") and b.get("upper"):
        return {"lower": float(b["lower"]), "upper": float(b["upper"])}, "the plan's band"
    return None, None


def check_orders(orders, cfg, portfolio=None, prices=None, broker=None, now=None, prior=None):
    now = now or psx.now_pkt()
    prior = prior or {}
    today = now.strftime("%Y-%m-%d")
    t = psx.ms(now)
    st = day_state(cfg, portfolio, prices, broker, today)
    fee, slip, one = costs(cfg)
    lot = int(cfg.get("lot_size") or 1)
    sessions = psx.sessions(today, cfg)
    current = next((s for s in sessions if s["start"] <= t < s["end"]), None)
    win_a, win_b = (cfg.get("entry_window_minutes") or [15, 120])[:2]
    flat_min = int(cfg.get("flat_by_minutes") or 0)
    max_loss = float(cfg.get("max_loss_per_trade") or 0)
    daily_limit = float(cfg.get("daily_loss_limit") or 0)
    max_trades = int(cfg.get("max_trades_per_day") or 0)
    min_rr = float(cfg.get("min_reward_risk") or 0)
    buffer_amt = st["total"] * float(cfg.get("cash_buffer_pct") or 0) / 100
    cap_amt = st["total"] * float(cfg.get("max_position_pct") or 100) / 100
    cash_left = st["cash"]
    trades = st["trades"]
    risk_used = st["realized_loss"] + st["reserved"]
    seen = set()
    verdicts = []
    for o in orders:
        checks, warnings = [], []

        def add(name, ok, detail):
            checks.append({"name": name, "ok": bool(ok), "detail": detail})

        sym = str(o.get("symbol") or "").upper()
        o = dict(o, symbol=sym)
        oid = o.get("id") or "?"
        rebalance = o.get("kind") == "rebalance"
        try:
            qty = int(o.get("qty") or 0)
            limit = float(o.get("limit") or 0)
            stop = float(o["stop"]) if o.get("stop") is not None else None
            target = float(o["target"]) if o.get("target") is not None else None
        except (TypeError, ValueError):
            qty, limit, stop, target = 0, 0.0, None, None
        shape_ok = (str(o.get("side", "buy")).lower() == "buy" and qty > 0 and qty % lot == 0 and limit > 0
                    and (rebalance or (stop is not None and target is not None and 0 < stop < limit < target)))
        add("order shape", shape_ok,
            "buy %s shares (lot %d) at %s, stop %s, target %s" % (qty, lot, psx.rs(limit), psx.rs(stop), psx.rs(target))
            if shape_ok else "needs a buy (long only), whole lots of %d, and stop < limit < target" % lot)
        cost = qty * psx.buy_cost(limit, fee, slip) if limit > 0 else 0.0

        # --- when
        add("trading day", bool(sessions), "PSX trades today" if sessions else "PSX is closed today (weekend or holiday)")
        add("session date", o.get("session_date") == today,
            "order is for today" if o.get("session_date") == today else "order is for %s, not today %s" % (o.get("session_date"), today))
        add("market open", current is not None,
            "%s session, closes %s" % (current["family"], psx.hhmm(current["end"])) if current else
            "PSX is not in a trading session now (%s)" % now.strftime("%H:%M"))
        if not rebalance:
            if current:
                # Counted from the session's first full 5-minute candle, like psx-trader-entry.
                first = -(-current["start"] // psx.FIVE_MS) * psx.FIVE_MS
                a_t = first + win_a * psx.MINUTE_MS
                b_t = min(first + win_b * psx.MINUTE_MS, current["end"] - flat_min * psx.MINUTE_MS)
                add("entry window", a_t <= t <= b_t, "entries allowed %s to %s this session; now %s"
                    % (psx.hhmm(a_t), psx.hhmm(b_t), now.strftime("%H:%M")))
            else:
                add("entry window", False, "no entries outside a session")
            fb = clock(o.get("flat_by"), today) if o.get("flat_by") else None
            if fb is None:
                add("flat-by", False, "the order has no flat_by time")
            else:
                home = current or next((s for s in sessions if s["start"] < fb <= s["end"]), None)
                ok = home is not None and home["start"] < fb <= home["end"] and fb > t
                if ok:
                    detail = "flat by %s, session ends %s" % (o["flat_by"], psx.hhmm(home["end"]))
                elif home is None:
                    detail = "flat by %s is not inside a PSX session" % o["flat_by"]
                elif fb <= t:
                    detail = "flat by %s has already passed" % o["flat_by"]
                else:
                    detail = "flat by %s is after this session ends at %s" % (o["flat_by"], psx.hhmm(home["end"]))
                add("flat-by", ok, detail)
                if ok and fb > home["end"] - flat_min * psx.MINUTE_MS:
                    warnings.append("flat-by %s leaves less than %d minutes before the close" % (o["flat_by"], flat_min))

        # --- money and risk
        if not rebalance and stop is not None and target is not None and limit > stop:
            uloss = unit_loss(limit, stop, cfg)
            loss = qty * uloss
            add("max loss per trade", loss <= max_loss + 1e-9,
                "%s at the stop after charges (limit %s)" % (psx.rs(loss), psx.rs(max_loss)))
            add("daily loss limit", risk_used + loss <= daily_limit + 1e-9,
                "losses taken today %s + open risk %s + this %s = %s (limit %s)"
                % (psx.rs(st["realized_loss"]), psx.rs(risk_used - st["realized_loss"]), psx.rs(loss),
                   psx.rs(risk_used + loss), psx.rs(daily_limit)))
            add("trades per day", trades < max_trades, "%d of %d trades already today" % (trades, max_trades))
            ureward = psx.sell_proceeds(target, fee, slip, one) - psx.buy_cost(limit, fee, slip)
            rr = ureward / uloss if uloss > 0 else 0
            add("reward/risk", rr >= min_rr, "%.2f after charges (minimum %.2f)" % (rr, min_rr))
            covers = ureward > 1e-9 and not o.get("skip")
            add("target covers costs", covers, "target makes %s a share after charges" % psx.rs(ureward) if covers
                else "Skip - the target does not cover costs (%s a share)" % psx.rs(ureward))
        else:
            loss = 0.0
        held = st["held"].get(sym, 0.0)
        add("position size", cost + held <= cap_amt + 1e-6,
            "%s%s of %s cap (%s%% of %s)" % (psx.rs(cost), " + %s held" % psx.rs(held) if held else "", psx.rs(cap_amt),
                                             cfg.get("max_position_pct"), psx.rs(st["total"])))
        add("cash after buffer", cost <= cash_left - buffer_amt + 1e-6,
            "costs %s; cash %s less buffer %s leaves %s (%s)" % (psx.rs(cost), psx.rs(cash_left), psx.rs(buffer_amt),
                                                              psx.rs(cash_left - buffer_amt), st["money_from"]))

        # --- price band
        band, basis = band_of(o, prices, prior)
        if band:
            add("price band", band["lower"] <= limit <= band["upper"],
                "limit %s inside %s-%s (%s, an estimate)" % (psx.rs(limit), psx.rs(band["lower"]), psx.rs(band["upper"]), basis)
                if band["lower"] <= limit <= band["upper"] else
                "limit %s is outside today's band %s-%s (%s): it cannot trade" % (psx.rs(limit), psx.rs(band["lower"]), psx.rs(band["upper"]), basis))
            if stop is not None and stop < band["lower"]:
                warnings.append("stop %s is below the lower limit %s: it cannot fill today" % (psx.rs(stop), psx.rs(band["lower"])))
            elif stop is not None and stop <= band["lower"] + 2 * psx.PRICE_TICK:
                warnings.append("stop is at the lower limit: if the stock locks there it may not fill")
            if target is not None and target > band["upper"]:
                warnings.append("target %s is above the upper limit %s: it cannot be reached today" % (psx.rs(target), psx.rs(band["upper"])))
        else:
            warnings.append("price band unknown (no prior close): run alerts quote --write, or pass --prior-close %s=PRICE" % sym)

        # --- duplicates
        dup = None
        if held:
            dup = "%s is already held in portfolio.json" % sym
        elif sym in st["symbols_today"]:
            dup = "%s already has order %s in today's broker log" % (sym, st["symbols_today"][sym])
        elif sym in seen:
            dup = "%s appears twice in this batch" % sym
        add("duplicate", dup is None, dup or "no other %s order or holding today" % sym)
        seen.add(sym)

        for w in o.get("warnings") or []:
            if w not in warnings:
                warnings.append(w)
        if cfg.get("paper", True) is False:
            warnings.append("paper is false in your config: you are trading real money")
        reasons = [c["name"] + ": " + c["detail"] for c in checks if not c["ok"]]
        verdict = "BLOCK" if reasons else "PASS"
        if verdict == "PASS":
            cash_left -= cost
            if not rebalance:
                trades += 1
                risk_used += loss
        verdicts.append({"id": oid, "symbol": sym, "verdict": verdict, "checks": checks, "reasons": reasons,
                         "warnings": warnings, "qty": qty, "limit": limit, "max_loss": round(loss, 2), "cost": round(cost, 2)})
    return {"checked_at": now.strftime("%Y-%m-%d %H:%M PKT"), "verdicts": verdicts,
            "today": {"trades_before": st["trades"], "realized_loss": round(st["realized_loss"], 2),
                      "open_risk": round(st["reserved"], 2), "cash_after_passed": round(cash_left, 2)}}


def report(doc):
    lines = []
    for v in doc["verdicts"]:
        lines.append("%-5s %s  BUY %s %s at %s: max loss %s, cost %s"
                     % (v["verdict"], v["id"], "{:,}".format(v["qty"]), v["symbol"], psx.rs(v["limit"]), psx.rs(v["max_loss"]), psx.rs(v["cost"])))
        for c in v["checks"]:
            lines.append("        %s %-20s %s" % ("ok " if c["ok"] else "NO ", c["name"], c["detail"]))
        for r in v["reasons"]:
            lines.append("      - BLOCKED by " + r)
        for w in v["warnings"]:
            lines.append("      ! " + w)
    passed = sum(1 for v in doc["verdicts"] if v["verdict"] == "PASS")
    lines.append("")
    lines.append("%d passed, %d blocked at %s. Cash after the passed orders: %s. A PASS is a rules check, not advice and not a yes."
                 % (passed, len(doc["verdicts"]) - passed, doc["checked_at"], psx.rs(doc["today"]["cash_after_passed"])))
    return lines


def main(argv=None):
    ap = argparse.ArgumentParser(description="PSX Risk Manager: PASS or BLOCK each order (psx-trader-risk).")
    ap.add_argument("--orders", help="orders file (default trader/orders.json)")
    ap.add_argument("--now", help='pin the clock, "YYYY-MM-DD HH:MM" Pakistan time')
    ap.add_argument("--prior-close", action="append", default=[], metavar="SYMBOL=PRICE",
                    help="yesterday's close for the price band (repeatable)")
    ap.add_argument("--quotes", action="store_true", help="read prior closes (LDCP) from PSX Market Watch")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--write", action="store_true", help="write trader/risk.json")
    a = ap.parse_args(argv)
    cfg = psx.load_config()
    doc = psx.read_json(a.orders or psx.path("orders.json"), "orders (run psx-trader-budget first)")
    orders = doc.get("orders") if isinstance(doc, dict) else None
    if not orders:
        raise psx.PsxError("No orders to check.")
    prior = {}
    for item in a.prior_close:
        try:
            k, v = item.split("=", 1)
            prior[psx.clean_symbol(k)] = float(v)
        except ValueError:
            raise psx.PsxError("--prior-close wants SYMBOL=PRICE, like OGDC=316.24.")
    if a.quotes:
        for sym, row in psx.quotes([o.get("symbol") for o in orders], cfg).items():
            if row.get("ldcp") and sym not in prior:
                prior[sym] = row["ldcp"]
    res = check_orders(orders, cfg,
                       psx.read_json(psx.path("portfolio.json"), "portfolio", required=False),
                       psx.read_json(psx.path("prices.json"), "prices", required=False),
                       psx.read_json(psx.path("state", "broker.json"), "broker log", required=False),
                       psx.parse_pkt(a.now) if a.now else None, prior)
    print(json.dumps(res, indent=2) if a.json else "\n".join(report(res)))
    if a.write:
        print("Wrote %s." % psx.write_json(psx.path("risk.json"), res))
    return 1 if any(v["verdict"] == "BLOCK" for v in res["verdicts"]) else 0


if __name__ == "__main__":
    psx.run(main)
