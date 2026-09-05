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


INTRADAY_INTERVALS = {"1m", "5m", "15m", "30m", "1h"}
INTRADAY_PERIODS = {"1d", "5d", "1w", "1mo"}


def _load_dotenv_quiet():
    try:
        from dotenv import load_dotenv
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        load_dotenv(root / ".env.local")
        load_dotenv(root / ".env")
    except Exception:
        pass


def _row_get(row: Any, *names: str) -> Any:
    if isinstance(row, dict):
        lower = {str(k).lower(): v for k, v in row.items()}
        for n in names:
            if n.lower() in lower:
                return lower[n.lower()]
        return None
    for n in names:
        if hasattr(row, n):
            return getattr(row, n)
        if hasattr(row, n.lower()):
            return getattr(row, n.lower())
        if hasattr(row, n.upper()):
            return getattr(row, n.upper())
    return None


def _to_time_ms(val: Any) -> int:
    if val is None:
        return 0
    if hasattr(val, "timestamp"):
        try:
            return int(val.timestamp() * 1000)
        except Exception:
            pass
    if isinstance(val, (int, float)):
        n = float(val)
        return int(n if n > 1e12 else n * 1000)
    try:
        import pandas as pd

        ts = pd.Timestamp(val)
        if ts.tzinfo is None:
            # PSX session times are PKT (UTC+5)
            ts = ts.tz_localize("Asia/Karachi")
        return int(ts.timestamp() * 1000)
    except Exception:
        return 0


def get_intraday_ohlcv(
    symbol: str,
    interval: str = "5m",
    period: str = "5d",
) -> dict[str, Any]:
    """
    Intraday OHLCV via authenticated pypsx SDK (same as Colab).
    Keys: PYPSX_API_KEY_ID + PYPSX_API_SECRET_KEY (server env only).
    Coverage roughly from 2025-10-20 onward.
    """
    _load_dotenv_quiet()
    clean = (symbol or "").strip().upper()
    interval = (interval or "5m").strip().lower()
    period = (period or "5d").strip().lower()
    if not clean:
        return {"error": "symbol required"}
    if interval not in INTRADAY_INTERVALS:
        interval = "5m"
    if period not in INTRADAY_PERIODS:
        period = "5d"

    import os

    key_id = (os.environ.get("PYPSX_API_KEY_ID") or "").strip()
    secret = (os.environ.get("PYPSX_API_SECRET_KEY") or "").strip()
    if not key_id or not secret:
        return {
            "error": "PYPSX API keys missing",
            "hint": "Set PYPSX_API_KEY_ID and PYPSX_API_SECRET_KEY in Vercel env / .env.local",
        }

    try:
        import pypsx
    except ImportError:
        return {"error": "pypsx not installed", "hint": "pip install pypsx"}

    try:
        df = pypsx.get_intraday(clean, period=period, interval=interval)
        if df is None or getattr(df, "empty", True):
            return {
                "symbol": clean,
                "interval": interval,
                "period": period,
                "bars": [],
                "count": 0,
                "source": "pypsx:intraday",
                "note": "No intraday bars (check market hours / coverage from 2025-10-20).",
            }

        flat = flatten_columns(df)
        if hasattr(flat.index, "names") and flat.index.names and flat.index.names[0]:
            flat = flat.reset_index()

        bars = []
        for _, row in flat.iterrows():
            raw = row.to_dict() if hasattr(row, "to_dict") else row
            t = _to_time_ms(
                _row_get(raw, "datetime", "Datetime", "DATE", "date", "time", "Time", "index")
            )
            if not t and hasattr(row, "name"):
                t = _to_time_ms(row.name)
            o = _row_get(raw, "open", "OPEN", "Open")
            h = _row_get(raw, "high", "HIGH", "High")
            lo = _row_get(raw, "low", "LOW", "Low")
            c = _row_get(raw, "close", "CLOSE", "Close")
            v = _row_get(raw, "volume", "VOLUME", "Volume") or 0
            try:
                o, h, lo, c = float(o), float(h), float(lo), float(c)
                v = float(v) if v is not None else 0.0
            except (TypeError, ValueError):
                continue
            if not (t > 0 and c > 0 and o > 0 and h > 0 and lo > 0):
                continue
            if any(math.isnan(x) for x in (o, h, lo, c)):
                continue
            bars.append(
                {
                    "time": t,
                    "open": o,
                    "high": h,
                    "low": lo,
                    "close": c,
                    "volume": v if not math.isnan(v) else 0,
                }
            )

        bars.sort(key=lambda b: b["time"])
        # Dedupe identical timestamps (keep last)
        by_t = {b["time"]: b for b in bars}
        bars = sorted(by_t.values(), key=lambda b: b["time"])

        return {
            "symbol": clean,
            "interval": interval,
            "period": period,
            "bars": bars,
            "count": len(bars),
            "source": "pypsx:intraday",
        }
    except Exception as exc:
        return {"error": str(exc), "symbol": clean, "interval": interval, "period": period}
