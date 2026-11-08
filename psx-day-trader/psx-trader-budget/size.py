#!/usr/bin/env python3
"""Budget Manager for psx-trader-budget. Standard library only.

Turns the plan ("buy OGDC at 313.00, stop 311.50") into one exact order
("buy 1,500 shares"), inside the limits in trader/config.json, with PSX
charges counted on both sides.

    python3 psx-trader-budget/size.py                      # trader/plan.json + trader/config.json
    python3 psx-trader-budget/size.py --write              # write trader/orders.json
    python3 psx-trader-budget/size.py --capital 300000 --max-loss 3000
    python3 psx-trader-budget/size.py rebalance --targets targets.json [--write]

Sizing (mirrors sizePlan in the PSX Trading Lab):
  cost a share   = entry + slippage + charges (commission + 15% sales tax, CDC, exchange fees)
  loss a share   = cost a share - money from selling at the stop (slippage and charges again)
  shares         = the smallest of
                     risk budget   max_loss_per_trade / loss a share
                     position cap  capital x max_position_pct / cost a share
                     cash buffer   (cash - capital x cash_buffer_pct) / cost a share
                     maximum order max_order / cost a share (when max_order is set)
                   rounded DOWN to whole lots.
It never places an order. trader-risk checks it next.
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "psx-trader-common"))
import psx  # noqa: E402

TARGET_COST_SKIP = "Skip - the target does not cover costs"
STOP_TOO_CLOSE = "Stop is too close to entry"
DEFAULT_MIN_ORDER = 5000


def costs(cfg):
    return float(cfg.get("fee_pct") or 0), float(cfg.get("slip_pct") or 0), bool(cfg.get("one_side_commission"))


def minimum_stop_distance(entry, stop, cfg):
    """Two price steps, or what a round trip costs per share, whichever is larger."""
    fee, slip, one = costs(cfg)
    round_trip = (psx.buy_cost(entry, fee, slip) - entry) + (stop - psx.sell_proceeds(stop, fee, slip, one))
    return max(2 * psx.PRICE_TICK, round_trip)


def money(cfg, portfolio, symbol, capital=None):
    """(capital, cash, value already held in this symbol). portfolio.json cash wins over the config."""
    held = 0.0
    if capital is not None:
        return float(capital), float(capital), held, "--capital"
    if portfolio and isinstance(portfolio.get("cash"), (int, float)):
        cash = float(portfolio["cash"])
        total = cash
        for p in portfolio.get("positions") or []:
            try:
                v = float(p["qty"]) * float(p.get("price") or p["avg_price"])
            except (KeyError, TypeError, ValueError):
                continue
            total += v
            if str(p.get("symbol", "")).upper() == symbol:
                held += v
        return total, cash, held, "portfolio.json (cash plus holdings at cost)"
    cap = float(cfg.get("capital") or 0)
    return cap, cap, held, "config capital"


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


def band_for(plan, prices):
    b = plan.get("band")
    if isinstance(b, dict) and b.get("lower") and b.get("upper"):
        return {"lower": float(b["lower"]), "upper": float(b["upper"]), "basis": b.get("basis", "plan")}
    row = prices_row(prices, plan["symbol"])
    if row and row.get("ldcp"):
        return psx.price_band(float(row["ldcp"]))
    return None


def size_plan(plan, cfg, capital=None, max_loss=None, portfolio=None, band=None, now=None):
    """One order from the plan. Returns {"errors": [...]} or {"order": {...}, "limits": {...}}."""
    errors = []
    try:
        sym = psx.clean_symbol(plan.get("symbol"))
    except psx.PsxError as e:
        return {"errors": [str(e)]}
    if str(plan.get("side") or "buy").lower() != "buy":
        errors.append("Long only: PSX day trades here are buys (no short selling).")
    try:
        entry, stop, target = (float(plan[k]) for k in ("entry", "stop", "target"))
    except (KeyError, TypeError, ValueError):
        return {"errors": ["The plan needs numbers for entry, stop and target."]}
    if not 0 < stop < entry < target:
        errors.append("For a buy, use stop < entry < target (got stop %.2f, entry %.2f, target %.2f)." % (stop, entry, target))
    lot = int(cfg.get("lot_size") or 1)
    risk_budget = float(max_loss if max_loss is not None else cfg.get("max_loss_per_trade") or 0)
    fee, slip, one = costs(cfg)
    if lot < 1 or risk_budget <= 0 or not 0 <= fee <= 10 or not 0 <= slip <= 10:
        errors.append("Check lot_size, max_loss_per_trade, fee_pct and slip_pct in trader/config.json.")
    buffer_pct = float(cfg.get("cash_buffer_pct") or 0)
    cap_pct = float(cfg.get("max_position_pct") or 0)
    max_order = float(cfg.get("max_order") or 0)
    min_order = float(cfg.get("min_order", DEFAULT_MIN_ORDER) or 0)
    if not (0 <= buffer_pct < 100 and 0 < cap_pct <= 100):
        errors.append("Check cash_buffer_pct and max_position_pct in trader/config.json.")
    if not errors:
        minimum = minimum_stop_distance(entry, stop, cfg)
        if entry - stop < minimum - 1e-9:
            errors.append("%s: it must be at least %s below the entry (two price steps or the round-trip charges, "
                          "whichever is larger)." % (STOP_TOO_CLOSE, psx.rs(minimum)))
    if errors:
        return {"errors": errors}

    band = band or band_for(plan, None)
    total, cash, held, basis = money(cfg, portfolio, sym, capital)
    unit_cost = psx.buy_cost(entry, fee, slip)
    unit_loss = unit_cost - psx.sell_proceeds(stop, fee, slip, one)
    unit_reward = psx.sell_proceeds(target, fee, slip, one) - unit_cost
    caps = {"position cap": max(0.0, total * cap_pct / 100 - held),
            "cash buffer": max(0.0, cash - total * buffer_pct / 100)}
    if max_order > 0:
        caps["maximum order"] = max_order
    cap_name = min(caps, key=lambda k: caps[k])
    by_risk = math.floor(risk_budget / unit_loss / lot) * lot
    by_cap = math.floor(caps[cap_name] / unit_cost / lot) * lot
    qty = max(0, min(by_risk, by_cap))
    binding = "risk budget" if by_risk <= by_cap else cap_name
    rr = unit_reward / unit_loss
    limits = {"capital": round(total, 2), "cash": round(cash, 2), "money_from": basis, "lot_size": lot,
              "cost_per_share": round(unit_cost, 4), "loss_per_share": round(unit_loss, 4),
              "reward_per_share": round(unit_reward, 4), "risk_budget": risk_budget,
              "shares_by_risk": by_risk, "shares_by_cap": by_cap,
              "caps": {k: round(v, 2) for k, v in caps.items()}}
    if not qty:
        return {"errors": ["The budget cannot fund one lot of %d within these limits (%s allows %d)." % (lot, binding, min(by_risk, by_cap))],
                "limits": limits}

    warnings = []
    skip = psx.net_per_share(entry, target, fee, slip, one) <= 1e-9
    if skip:
        warnings.append(TARGET_COST_SKIP + ": selling at %s after charges does not beat the cost of buying." % psx.rs(target))
    min_rr = float(cfg.get("min_reward_risk") or 0)
    if rr < min_rr:
        warnings.append("Reward/risk after charges is %.2f, below your minimum %.2f." % (rr, min_rr))
    if min_order > 0 and qty * unit_cost < min_order:
        warnings.append("Order value %s is below %s: fixed per-share charges weigh more on small orders."
                        % (psx.rs(qty * unit_cost, 0), psx.rs(min_order, 0)))
    gap_loss = None
    if band:
        if entry >= band["upper"] - 2 * psx.PRICE_TICK:
            warnings.append("Entry is within two price steps of the upper limit %s: buy orders may queue there and not fill." % psx.rs(band["upper"]))
        if stop <= band["lower"] + 2 * psx.PRICE_TICK:
            warnings.append("Stop is at or near the lower limit %s: if the stock locks there, the stop may not fill." % psx.rs(band["lower"]))
        if 0 < band["lower"] < stop:
            gap_loss = qty * (unit_cost - psx.sell_proceeds(band["lower"], fee, slip, one))
            if gap_loss > 2 * risk_budget:
                warnings.append("A fall to the day's lower limit %s would lose %s, over twice your %s risk budget."
                                % (psx.rs(band["lower"]), psx.rs(gap_loss, 0), psx.rs(risk_budget, 0)))
    else:
        warnings.append("Price band unknown (no band in the plan and no ldcp in prices.json): limit checks skipped.")
    now = now or psx.now_pkt()
    day = plan.get("session_date") or now.strftime("%Y-%m-%d")
    if day != now.strftime("%Y-%m-%d"):
        warnings.append("The plan is for %s, not today: trader-risk will block it." % day)
    profit = qty * unit_reward
    order = {
        "id": "%s-%s" % (sym, now.strftime("%Y%m%d-%H%M")), "symbol": sym, "side": "buy", "type": "limit",
        "qty": qty, "limit": psx.round_tick(entry), "stop": psx.round_tick(stop), "target": psx.round_tick(target),
        "flat_by": plan.get("flat_by"), "session_date": day,
        "est_cost": round(qty * unit_cost, 2), "max_loss_at_stop": round(qty * unit_loss, 2),
        "profit_at_target": round(profit, 2),
        "profit_after_cgt": round(profit - psx.cgt(profit, float(cfg.get("cgt_pct") or 0)), 2),
        "net_rr": round(rr, 2), "binding": binding,
        "gap_loss_at_lower_limit": round(gap_loss, 2) if gap_loss is not None else None,
        "band": band, "skip": skip, "paper": bool(cfg.get("paper", True)), "warnings": warnings,
    }
    return {"order": order, "limits": limits, "errors": []}


def report(res, cfg):
    lim, o = res.get("limits"), res.get("order")
    lines = []
    if lim:
        lines.append("Money: capital %s, cash %s (%s). Lot size %d."
                     % (psx.rs(lim["capital"]), psx.rs(lim["cash"]), lim["money_from"], lim["lot_size"]))
        lines.append("A share costs %s with charges; the stop loses %s a share and the target makes %s a share after charges both sides."
                     % (psx.rs(lim["cost_per_share"]), psx.rs(lim["loss_per_share"]), psx.rs(lim["reward_per_share"])))
        rows = [{"limit": "risk budget", "math": "%s / %s" % (psx.rs(lim["risk_budget"], 0), psx.rs(lim["loss_per_share"])),
                 "shares": lim["shares_by_risk"]}]
        for k, v in lim["caps"].items():
            rows.append({"limit": k, "math": "%s / %s" % (psx.rs(v, 0), psx.rs(lim["cost_per_share"])),
                         "shares": int(math.floor(v / lim["cost_per_share"] / lim["lot_size"]) * lim["lot_size"])})
        decided = o["binding"] if o else None
        lines += ["", psx.table(rows, [("limit", "limit"), ("the math", "math"),
                                       ("shares", lambda r: "%d%s" % (r["shares"], "  <- decides it" if r["limit"] == decided else ""))]), ""]
    for e in res.get("errors") or []:
        lines.append("No order: " + e)
    if o:
        lines.append("Order %s: BUY %s %s, limit %s, stop %s, target %s, flat by %s."
                     % (o["id"], "{:,}".format(o["qty"]), o["symbol"], psx.rs(o["limit"]), psx.rs(o["stop"]),
                        psx.rs(o["target"]), o["flat_by"] or "-"))
        lines.append("  Cost %s. Loss if the stop fills: %s. Profit at the target: %s (after %g%% CGT: %s). Net reward/risk %.2f."
                     % (psx.rs(o["est_cost"]), psx.rs(o["max_loss_at_stop"]), psx.rs(o["profit_at_target"]),
                        float(cfg.get("cgt_pct") or 0), psx.rs(o["profit_after_cgt"]), o["net_rr"]))
        if o["gap_loss_at_lower_limit"] is not None:
            lines.append("  If it gaps to the lower limit %s: about %s." % (psx.rs(o["band"]["lower"]), psx.rs(o["gap_loss_at_lower_limit"])))
        if o["skip"]:
            lines.append("  SKIP: " + TARGET_COST_SKIP + ".")
        lines += ["  Warning: " + w for w in o["warnings"]]
        lines.append("A stop is a plan, not a promise: a gap or a lower-limit lock can fill it worse or not at all. Charges are estimates.")
    return lines


# ---------------------------------------------------------------- rebalance (upstream weights mode)

def rebalance(targets, cfg, portfolio=None, quotes=None, now=None):
    """Buy orders that move the portfolio toward target weights. Long only: overweight stocks are reported, never sold."""
    if isinstance(targets.get("targets"), dict):
        targets = targets["targets"]
    weights = {}
    for k, v in targets.items():
        if k.startswith("_"):
            continue
        try:
            w = float(v)
        except (TypeError, ValueError):
            raise psx.PsxError("Weight for %s must be a number." % k)
        if w < 0:
            raise psx.PsxError("Weight for %s must not be negative." % k)
        weights[psx.clean_symbol(k)] = w
    if not weights or sum(weights.values()) <= 0:
        raise psx.PsxError("The targets file needs at least one positive weight, like {\"OGDC\": 40, \"HUBC\": 60}.")
    quotes = quotes if quotes is not None else psx.quotes(list(weights), cfg)
    fee, slip, _ = costs(cfg)
    lot = int(cfg.get("lot_size") or 1)
    min_order = float(cfg.get("min_order", DEFAULT_MIN_ORDER) or 0)
    holdings = {}
    cash = float((portfolio or {}).get("cash", cfg.get("capital") or 0))
    for p in (portfolio or {}).get("positions") or []:
        holdings[str(p.get("symbol", "")).upper()] = float(p.get("qty") or 0)

    def price(sym):
        q = quotes.get(sym) or {}
        return q.get("current") or q.get("ldcp")

    total = cash + sum(q * (price(s) or 0) for s, q in holdings.items())
    investable = total * (1 - float(cfg.get("cash_buffer_pct") or 0) / 100)
    spendable = cash - total * float(cfg.get("cash_buffer_pct") or 0) / 100
    cap = total * float(cfg.get("max_position_pct") or 100) / 100
    wsum = sum(weights.values())
    now = now or psx.now_pkt()
    orders, notes = [], []
    for sym in sorted(weights):
        px = price(sym)
        if not px:
            notes.append("%s: no price on Market Watch, skipped." % sym)
            continue
        goal = min(investable * weights[sym] / wsum, cap)
        have = holdings.get(sym, 0) * px
        want = goal - have
        if want <= 0:
            notes.append("%s: already at or above its target (%s held vs %s); this tool only buys." % (sym, psx.rs(have, 0), psx.rs(goal, 0)))
            continue
        unit = psx.buy_cost(px, fee, slip)
        qty = int(math.floor(min(want, max(0.0, spendable)) / unit / lot) * lot)
        if qty <= 0 or qty * unit < min_order:
            notes.append("%s: the buy (%s) is below the minimum order %s or the cash left, skipped." % (sym, psx.rs(max(qty, 0) * unit, 0), psx.rs(min_order, 0)))
            continue
        spendable -= qty * unit
        orders.append({"id": "%s-%s" % (sym, now.strftime("%Y%m%d-%H%M")), "symbol": sym, "side": "buy", "type": "limit",
                       "kind": "rebalance", "qty": qty, "limit": psx.round_tick(px), "stop": None, "target": None,
                       "flat_by": None, "session_date": now.strftime("%Y-%m-%d"), "est_cost": round(qty * unit, 2),
                       "max_loss_at_stop": None, "profit_at_target": None, "net_rr": None,
                       "binding": "target weight" if qty * unit <= want else "cash buffer",
                       "target_value": round(goal, 2), "warnings": ["A plain long-term buy with no stop: not a day trade."]})
    return {"orders": orders, "notes": notes, "total": round(total, 2), "investable": round(investable, 2)}


# ---------------------------------------------------------------- main

def main(argv=None):
    ap = argparse.ArgumentParser(description="PSX Budget Manager: size one order from trader/plan.json (psx-trader-budget).")
    ap.add_argument("mode", nargs="?", default="size", choices=["size", "rebalance"])
    ap.add_argument("--plan", help="plan file (default trader/plan.json)")
    ap.add_argument("--capital", type=float, help="use this capital instead of the config / portfolio.json")
    ap.add_argument("--max-loss", type=float, help="max loss per trade in rupees for this order")
    ap.add_argument("--targets", help="rebalance: JSON file of target weights, e.g. {\"OGDC\": 40, \"HUBC\": 60}")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--write", action="store_true", help="write trader/orders.json")
    a = ap.parse_args(argv)
    cfg = psx.load_config()
    portfolio = psx.read_json(psx.path("portfolio.json"), "portfolio", required=False)
    now = psx.now_pkt()
    if a.mode == "rebalance":
        if not a.targets:
            raise psx.PsxError("rebalance needs --targets FILE.")
        res = rebalance(psx.read_json(a.targets, "targets file"), cfg, portfolio, now=now)
        if a.json:
            print(json.dumps(res, indent=2))
        else:
            print("Portfolio %s, investable after the cash buffer %s." % (psx.rs(res["total"]), psx.rs(res["investable"])))
            if res["orders"]:
                print(psx.table(res["orders"], [("symbol", "symbol"), ("qty", "qty"), ("limit", lambda r: psx.rs(r["limit"])),
                                                ("cost", lambda r: psx.rs(r["est_cost"])), ("target value", lambda r: psx.rs(r["target_value"]))]))
            for n in res["notes"]:
                print("Note: " + n)
        if a.write and res["orders"]:
            print("Wrote %s." % psx.write_json(psx.path("orders.json"), {"created_at": now.strftime("%Y-%m-%d %H:%M PKT"), "orders": res["orders"]}))
        return 0
    plan = psx.read_json(a.plan or psx.path("plan.json"), "plan (run psx-trader-exit first)")
    prices = psx.read_json(psx.path("prices.json"), "prices", required=False)
    res = size_plan(plan, cfg, a.capital, a.max_loss, portfolio, band_for(plan, prices) if isinstance(plan, dict) else None, now)
    if a.json:
        print(json.dumps(res, indent=2))
    else:
        print("\n".join(report(res, cfg)))
        tmj = psx.read_json(psx.path("timemachine.json"), "time machine", required=False)
        if tmj and tmj.get("symbol") == plan.get("symbol") and tmj.get("verdict"):
            print("Time Machine said: " + tmj["verdict"])
    if not res.get("order"):
        return 1
    if a.write:
        print("Wrote %s." % psx.write_json(psx.path("orders.json"), {"created_at": now.strftime("%Y-%m-%d %H:%M PKT"), "orders": [res["order"]]}))
    if not a.json:
        print("Next: psx-trader-risk checks it against your daily limits. Nothing has been placed.")
    return 0


if __name__ == "__main__":
    psx.run(main)
