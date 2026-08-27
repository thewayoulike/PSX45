"""Shared pypsx-toolkit helpers for Vercel Python function + local scripts."""

from __future__ import annotations

import math
from typing import Any

PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}


def df_records(df):
    if df is None:
        return []
    out = df.copy()
    out.columns = [str(c).strip() for c in out.columns]
    if hasattr(out.index, "names") and out.index.names and out.index.names[0]:
        out = out.reset_index()
    out = out.drop(columns=[c for c in out.columns if c.upper() == "SYMBOL"], errors="ignore")
    return out.to_dict(orient="records")


def normalize_latest(row):
    if not row:
        return None
    return {
        "dividendYield": row.get("DIVIDEND YIELD", "-"),
        "annualDividend": row.get("ANNUAL DIVIDEND", "-"),
        "exDividendDate": row.get("EX-DIVIDEND DATE", "-"),
        "payoutFrequency": row.get("PAYOUT FREQUENCY", "-"),
        "payoutRatio": row.get("PAYOUT RATIO", "-"),
        "dividendGrowth": row.get("DIVIDEND GROWTH", "-"),
    }


def normalize_history(rows):
    out = []
    for row in rows or []:
        out.append(
            {
                "exDividendDate": row.get("EX-DIVIDEND DATE", "-"),
                "cashAmount": row.get("CASH AMOUNT", "-"),
                "recordDate": row.get("RECORD DATE", "-"),
                "payDate": row.get("PAY DATE", "-"),
            }
        )
    return out


def fundamentals_sections(df):
    if df is None or getattr(df, "empty", True):
        return []
    reset = df.reset_index()
    sections = []
    skip = {"Business Description"}
    for cat in ["Profile", "Governance", "Equity Profile"]:
        rows = reset[reset["CATEGORY"] == cat] if "CATEGORY" in reset.columns else []
        items = []
        for _, row in rows.iterrows():
            metric = str(row.get("METRIC", "")).strip()
            value = str(row.get("VALUE", "")).strip()
            if not metric or not value:
                continue
            if cat == "Governance":
                items.append({"label": value, "value": metric})
            elif metric in skip:
                continue
            else:
                items.append({"label": metric, "value": value})
        if items:
            sections.append({"category": cat, "items": items})
    return sections


def get_company_info(symbol: str) -> dict[str, Any]:
    clean = (symbol or "").strip().upper()
    if not clean:
        return {"error": "symbol required"}

    try:
        import pypsx_toolkit
    except ImportError:
        return {"error": "pypsx-toolkit not installed", "hint": "pip install pypsx-toolkit"}

    try:
        div_info = pypsx_toolkit.get_dividend_info(clean)
        div_hist = pypsx_toolkit.get_dividend_history(clean)
        description = pypsx_toolkit.get_business_description(clean)
        fund_df = pypsx_toolkit.get_company_fundamentals(clean)

        info_rows = df_records(div_info)
        hist_rows = df_records(div_hist)

        return {
            "symbol": clean,
            "businessDescription": description or "",
            "fundamentals": fundamentals_sections(fund_df),
            "latestDividend": normalize_latest(info_rows[0] if info_rows else None),
            "dividendHistory": normalize_history(hist_rows),
            "source": "pypsx",
        }
    except Exception as exc:
        return {"error": str(exc), "symbol": clean}


def flatten_columns(df):
    out = df.copy()
    out.columns = [c[-1] if isinstance(c, tuple) else c for c in out.columns]
    return out


def to_ms(idx):
    if hasattr(idx, "timestamp"):
        return int(idx.timestamp() * 1000)
    return int(idx)


def get_chart_analysis(symbol: str, period: str = "6mo") -> dict[str, Any]:
    clean = (symbol or "").strip().upper()
    period = (period or "6mo").strip().lower()
    if not clean:
        return {"error": "symbol required"}
    if period not in PERIODS:
        period = "6mo"

    try:
        import pypsx_toolkit as p
    except ImportError:
        return {"error": "pypsx-toolkit not installed", "hint": "pip install pypsx-toolkit"}

    try:
        df = p.download(clean, period=period, show_progress=False)
        if df is None or getattr(df, "empty", True):
            return {"error": "no data", "symbol": clean}

        flat = flatten_columns(df)
        upper, middle, lower = p.bollinger_bands(flat)
        rsi = p.rsi(flat)
        macd_line, signal_line, histogram = p.macd(flat)

        points = []
        for i, (idx, row) in enumerate(flat.iterrows()):
            try:
                u = float(upper.iloc[i])
                m = float(middle.iloc[i])
                lo = float(lower.iloc[i])
                r = float(rsi.iloc[i])
                c = float(row["CLOSE"])
            except (KeyError, TypeError, ValueError, IndexError):
                continue
            if any(math.isnan(x) for x in (u, m, lo, r, c)):
                continue
            pt = {
                "time": to_ms(idx),
                "close": c,
                "upper": u,
                "middle": m,
                "lower": lo,
                "rsi": r,
            }
            try:
                macd_v = float(macd_line.iloc[i])
                sig_v = float(signal_line.iloc[i])
                hist_v = float(histogram.iloc[i])
                if not any(math.isnan(x) for x in (macd_v, sig_v, hist_v)):
                    pt["macd"] = macd_v
                    pt["macdSignal"] = sig_v
                    pt["macdHist"] = hist_v
            except (TypeError, ValueError, IndexError):
                pass
            points.append(pt)

        return {
            "symbol": clean,
            "period": period,
            "points": points,
            "source": "pypsx",
        }
    except Exception as exc:
        return {"error": str(exc), "symbol": clean, "period": period}
