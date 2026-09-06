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


def normalize_latest(row, cash_amount: str | None = None):
    if not row:
        return None
    return {
        "dividendYield": row.get("DIVIDEND YIELD", "-"),
        "annualDividend": row.get("ANNUAL DIVIDEND", "-"),
        "cashAmount": cash_amount or row.get("CASH AMOUNT", "-"),
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


def fundamentals_sections(df, business_description: str = ""):
    if df is None or getattr(df, "empty", True):
        return []
    reset = df.reset_index()
    sections = []
    skip = {"Business Description"}
    desc_norm = " ".join((business_description or "").split()).lower()
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
            elif cat == "Profile" and metric.lower() == "address" and desc_norm:
                # Toolkit sometimes repeats the business description as Address.
                if " ".join(value.split()).lower() == desc_norm or len(value) > 180:
                    continue
                items.append({"label": metric, "value": value})
            else:
                items.append({"label": metric, "value": value})
        if items:
            sections.append({"category": cat, "items": items})
    return sections


def _pipe_series(value: str) -> list[str]:
    s = (value or "").strip()
    if not s or s == "-":
        return []
    return [p.strip() for p in s.split("|") if p.strip()]


def _period_labels(n: int, years: list[str] | None = None) -> list[str]:
    if years and len(years) >= n:
        return years[:n]
    if years:
        out = list(years)
        while len(out) < n:
            out.append(f"FY-{len(out)}")
        return out[:n]
    return ["FY" if i == 0 else f"FY-{i}" for i in range(n)]


def _format_quarter_label(period_ended: str) -> str:
    """2026-06-30 → Jun 2026; bare year left as-is."""
    s = (period_ended or "").strip()
    if not s or s == "-":
        return s
    try:
        from datetime import datetime

        dt = datetime.strptime(s[:10], "%Y-%m-%d")
        return dt.strftime("%b %Y")
    except ValueError:
        if len(s) == 4 and s.isdigit():
            return s
        return s


def _labels_from_reports(reports_df, report_type: str, n: int) -> list[str]:
    if n <= 0 or reports_df is None or getattr(reports_df, "empty", True):
        return []
    reset = reports_df.reset_index()
    if "REPORT_TYPE" not in reset.columns:
        return []
    rows = reset[reset["REPORT_TYPE"].astype(str).str.lower() == report_type.lower()].copy()
    if rows.empty:
        return []
    rows["_period"] = rows["PERIOD_ENDED"].astype(str)
    rows = rows.sort_values("_period", ascending=False)
    labels: list[str] = []
    for p in rows["_period"].tolist():
        label = _format_quarter_label(p) if report_type.lower() == "quarterly" else str(p)[:4]
        if label and label not in labels:
            labels.append(label)
        if len(labels) >= n:
            break
    return labels


def _metric_map(df, category: str) -> dict[str, str]:
    if df is None or getattr(df, "empty", True):
        return {}
    reset = df.reset_index()
    if "CATEGORY" not in reset.columns:
        return {}
    out: dict[str, str] = {}
    for _, row in reset[reset["CATEGORY"] == category].iterrows():
        metric = str(row.get("METRIC", "")).strip()
        value = str(row.get("VALUE", "")).strip()
        if metric and value:
            out[metric] = value
    return out


def _pick_series(mmap: dict[str, str], keys: list[str]) -> list[str]:
    lower = {k.lower(): v for k, v in mmap.items()}
    for key in keys:
        if key.lower() in lower:
            return _pipe_series(lower[key.lower()])
    for key in keys:
        for mk, mv in mmap.items():
            if key.lower() in mk.lower():
                return _pipe_series(mv)
    return []


def _financial_rows(mmap: dict[str, str], years: list[str] | None = None) -> list[dict[str, str]]:
    sales = _pick_series(mmap, ["Sales", "Revenue"])
    income = _pick_series(mmap, ["Total Income"])
    profit = _pick_series(mmap, ["Profit after Taxation", "Profit After Tax", "Net Profit"])
    eps = _pick_series(mmap, ["EPS", "Earnings per share"])
    n = max(len(sales), len(income), len(profit), len(eps), 0)
    if n == 0:
        return []
    rows = []
    for i, year in enumerate(_period_labels(n, years)):
        rows.append(
            {
                "year": year,
                "sales": sales[i] if i < len(sales) else "-",
                "totalIncome": income[i] if i < len(income) else "-",
                "profitAfterTax": profit[i] if i < len(profit) else "-",
                "eps": eps[i] if i < len(eps) else "-",
            }
        )
    return rows


def _ratio_rows(mmap: dict[str, str], years: list[str] | None = None) -> list[dict[str, str]]:
    gpm = _pick_series(mmap, ["Gross Profit Margin"])
    npm = _pick_series(mmap, ["Net Profit Margin"])
    growth = _pick_series(mmap, ["EPS Growth"])
    peg = _pick_series(mmap, ["PEG"])
    n = max(len(gpm), len(npm), len(growth), len(peg), 0)
    if n == 0:
        return []
    rows = []
    for i, year in enumerate(_period_labels(n, years)):
        rows.append(
            {
                "year": year,
                "grossProfitMargin": gpm[i] if i < len(gpm) else "-",
                "netProfitMargin": npm[i] if i < len(npm) else "-",
                "epsGrowth": growth[i] if i < len(growth) else "-",
                "peg": peg[i] if i < len(peg) else "-",
            }
        )
    return rows


def build_statements(df, reports_df=None) -> dict[str, Any]:
    annual_map = _metric_map(df, "Financials Annual")
    quarterly_map = _metric_map(df, "Financials Quarterly")
    ratios_map = _metric_map(df, "Ratios")

    # Probe length before labeling
    annual_n = max(len(_pick_series(annual_map, ["Sales", "Revenue"])), 0) or max(
        len(_pick_series(annual_map, ["EPS"])), 0
    )
    quarterly_n = max(len(_pick_series(quarterly_map, ["Sales", "Revenue"])), 0) or max(
        len(_pick_series(quarterly_map, ["EPS"])), 0
    )
    ratios_n = max(len(_pick_series(ratios_map, ["Net Profit Margin"])), 0)

    annual_years = _labels_from_reports(reports_df, "Annual", max(annual_n, ratios_n))
    quarterly_years = _labels_from_reports(reports_df, "Quarterly", quarterly_n)

    annual_fin = _financial_rows(annual_map, annual_years)
    quarterly_fin = _financial_rows(quarterly_map, quarterly_years)
    # Toolkit "Ratios" series align with annual columns — never attach to quarterly.
    annual_ratios = _ratio_rows(ratios_map, annual_years)
    return {
        "annual": {"financials": annual_fin, "ratios": annual_ratios},
        "quarterly": {"financials": quarterly_fin, "ratios": []},
    }


def normalize_reports(df, limit: int = 8) -> list[dict[str, str]]:
    if df is None or getattr(df, "empty", True):
        return []
    reset = df.reset_index()
    rows = []
    for _, row in reset.iterrows():
        report_type = str(row.get("REPORT_TYPE", "")).strip()
        if not report_type and "REPORT_TYPE" in getattr(reset.index, "names", []):
            pass
        # MultiIndex columns from toolkit: REPORT_TYPE may be in index
        link = str(row.get("PDF_LINK", "") or "").strip()
        period = str(row.get("PERIOD_ENDED", "") or "").strip()
        posted = str(row.get("POSTING_DATE", "") or "").strip()
        if not report_type:
            # try index levels
            try:
                if hasattr(row, "name") and isinstance(row.name, tuple) and len(row.name) >= 2:
                    report_type = str(row.name[1])
            except Exception:
                report_type = ""
        if not link and not period:
            continue
        rows.append(
            {
                "reportType": report_type or "Report",
                "periodEnded": period or "-",
                "postingDate": posted or "-",
                "pdfLink": link,
            }
        )

    def sort_key(r: dict[str, str]):
        return r.get("periodEnded") or "", r.get("postingDate") or ""

    rows.sort(key=sort_key, reverse=True)
    # Prefer recent annual + quarterly mix: already sorted by period
    return rows[:limit]


def get_dividend_snapshot(symbol: str) -> dict[str, Any]:
    """Lean dividends-only payload for Future X-Dates gap-fill (no fundamentals/reports)."""
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
        info_rows = df_records(div_info)
        hist_norm = normalize_history(df_records(div_hist))
        latest_cash = hist_norm[0]["cashAmount"] if hist_norm else None
        return {
            "symbol": clean,
            "latestDividend": normalize_latest(info_rows[0] if info_rows else None, latest_cash),
            "dividendHistory": hist_norm,
            "source": "pypsx",
        }
    except Exception as exc:
        return {"error": str(exc), "symbol": clean}


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
        description = pypsx_toolkit.get_business_description(clean) or ""
        fund_df = pypsx_toolkit.get_company_fundamentals(clean)

        info_rows = df_records(div_info)
        hist_rows = df_records(div_hist)
        hist_norm = normalize_history(hist_rows)
        latest_cash = hist_norm[0]["cashAmount"] if hist_norm else None

        reports_df = None
        reports: list[dict[str, str]] = []
        try:
            reports_df = pypsx_toolkit.get_reports(clean)
            reports = normalize_reports(reports_df, limit=8)
        except Exception:
            reports = []

        return {
            "symbol": clean,
            "businessDescription": description,
            "fundamentals": fundamentals_sections(fund_df, description),
            "statements": build_statements(fund_df, reports_df),
            "latestDividend": normalize_latest(info_rows[0] if info_rows else None, latest_cash),
            "dividendHistory": hist_norm,
            "reports": reports,
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
INTRADAY_PERIODS = {"1d", "5d", "1w", "1mo", "all", "max"}
INTRADAY_COVERAGE_START = "2025-10-20T09:30:00+05:00"


def _load_dotenv_quiet():
    try:
        from dotenv import load_dotenv
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        load_dotenv(root / ".env.local")
        load_dotenv(root / ".env")
    except Exception:
        pass


def _require_pypsx_keys() -> dict[str, Any] | None:
    import os

    key_id = (os.environ.get("PYPSX_API_KEY_ID") or "").strip()
    secret = (os.environ.get("PYPSX_API_SECRET_KEY") or "").strip()
    if not key_id or not secret:
        return {
            "error": "PYPSX API keys missing",
            "hint": "Set PYPSX_API_KEY_ID and PYPSX_API_SECRET_KEY in Vercel env / .env.local",
        }
    return None


def _normalize_quote(symbol: str, quote: Any) -> dict[str, Any]:
    if not isinstance(quote, dict):
        quote = {}
    lower = {str(k).lower(): v for k, v in quote.items()}

    def pick(*names):
        for n in names:
            if n.lower() in lower and lower[n.lower()] is not None:
                return lower[n.lower()]
        return None

    price = pick("last", "price", "last_price", "close")
    try:
        price_f = float(price) if price is not None else None
    except (TypeError, ValueError):
        price_f = None
    out = {
        "symbol": symbol,
        "price": price_f,
        "last": price_f,
        "bid": pick("bid", "bid_price"),
        "ask": pick("ask", "ask_price"),
        "change": pick("change"),
        "change_pct": pick("change_pct", "change_percent"),
        "volume": pick("volume"),
        "high": pick("high"),
        "low": pick("low"),
        "source": "pypsx:quote",
    }
    # Keep extras that might be useful
    for k, v in quote.items():
        lk = str(k).lower()
        if lk not in out and lk not in {"symbol"}:
            out[str(k)] = v
    return out


def get_quote(symbol: str) -> dict[str, Any]:
    """Live price snapshot via pypsx.get_quote (authenticated)."""
    _load_dotenv_quiet()
    clean = (symbol or "").strip().upper().replace("PSX:", "")
    if not clean:
        return {"error": "symbol required"}
    missing = _require_pypsx_keys()
    if missing:
        return missing
    try:
        import pypsx
    except ImportError:
        return {"error": "pypsx not installed", "hint": "pip install pypsx"}
    try:
        raw = pypsx.get_quote(clean)
        normalized = _normalize_quote(clean, raw)
        if not normalized.get("price"):
            return {"error": "no quote price", "symbol": clean, "raw": raw}
        return normalized
    except Exception as exc:
        return {"error": str(exc), "symbol": clean}


def get_quotes(symbols: list[str] | str) -> dict[str, Any]:
    """Batch get_quote for Sync / alerts. Continues on per-symbol failures."""
    if isinstance(symbols, str):
        parts = [p.strip() for p in symbols.replace(";", ",").split(",")]
    else:
        parts = list(symbols or [])
    clean_list = []
    seen = set()
    for s in parts:
        u = str(s or "").strip().upper().replace("PSX:", "")
        if u and not u.startswith("MF:") and u not in seen:
            seen.add(u)
            clean_list.append(u)
    if not clean_list:
        return {"error": "symbols required", "quotes": {}}

    missing = _require_pypsx_keys()
    if missing:
        return {**missing, "quotes": {}}

    quotes: dict[str, Any] = {}
    errors: dict[str, str] = {}
    for sym in clean_list:
        payload = get_quote(sym)
        if payload.get("error"):
            errors[sym] = str(payload["error"])
        else:
            quotes[sym] = payload
    return {
        "quotes": quotes,
        "count": len(quotes),
        "errors": errors,
        "source": "pypsx:quote",
    }


def get_index_symbols_payload(name: str = "") -> dict[str, Any]:
    """
    Index / sector constituents from packaged pypsx data (no API key).
    name empty → return KSE-100 + KMI-30.
    """
    try:
        import pypsx
    except ImportError:
        return {"error": "pypsx not installed", "hint": "pip install pypsx"}

    def _list(index_name: str) -> list[str]:
        try:
            raw = pypsx.get_index_symbols(index_name)
        except Exception:
            raw = []
        out = []
        for s in raw or []:
            u = str(s).strip().upper()
            if u:
                out.append(u)
        return out

    try:
        requested = (name or "").strip()
        if requested:
            # Accept KSE100 / KMI30 aliases
            key = requested.upper().replace(" ", "")
            if key in ("KSE100", "KSE-100"):
                requested = "KSE-100"
            elif key in ("KMI30", "KMI-30"):
                requested = "KMI-30"
            symbols = _list(requested)
            return {
                "index": requested,
                "symbols": symbols,
                "count": len(symbols),
                "source": "pypsx:index",
            }

        kmi = _list("KMI-30")
        kse = _list("KSE-100")
        indices = []
        try:
            indices = list(pypsx.list_indices() or [])
        except Exception:
            pass
        return {
            "KMI30": kmi,
            "KSE100": kse,
            "indices": indices,
            "source": "pypsx:index",
        }
    except Exception as exc:
        return {"error": str(exc)}


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


def _bars_from_df(df) -> list[dict[str, Any]]:
    if df is None or getattr(df, "empty", True):
        return []
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
    by_t = {b["time"]: b for b in bars}
    return sorted(by_t.values(), key=lambda b: b["time"])


def _bars_from_historical_candles(candles: Any) -> list[dict[str, Any]]:
    """candles: list of [ts, open, high, low, close, volume] or dict rows."""
    bars = []
    for row in candles or []:
        try:
            if isinstance(row, (list, tuple)) and len(row) >= 5:
                ts, o, h, lo, c = row[0], row[1], row[2], row[3], row[4]
                v = row[5] if len(row) > 5 else 0
            elif isinstance(row, dict):
                ts = _row_get(row, "datetime", "time", "timestamp", "ts")
                o = _row_get(row, "open", "OPEN")
                h = _row_get(row, "high", "HIGH")
                lo = _row_get(row, "low", "LOW")
                c = _row_get(row, "close", "CLOSE")
                v = _row_get(row, "volume", "VOLUME") or 0
            else:
                continue
            t = _to_time_ms(ts)
            o, h, lo, c = float(o), float(h), float(lo), float(c)
            v = float(v) if v is not None else 0.0
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
        except (TypeError, ValueError, IndexError):
            continue
    bars.sort(key=lambda b: b["time"])
    by_t = {b["time"]: b for b in bars}
    return sorted(by_t.values(), key=lambda b: b["time"])


def _intraday_all_via_historical(clean: str, interval: str) -> dict[str, Any]:
    """Full coverage since ~2025-10-20 via TradingClient.get_historical_intraday."""
    from datetime import datetime, timezone, timedelta

    # 1m over ~11 months is huge — cap lookback to 30 calendar days for 1m.
    start = INTRADAY_COVERAGE_START
    note = None
    if interval == "1m":
        start_dt = datetime.now(timezone(timedelta(hours=5))) - timedelta(days=30)
        start = start_dt.strftime("%Y-%m-%dT09:30:00+05:00")
        note = "1m ALL capped to last 30 days (full history from Oct 2025 available on 5m/15m/1h)."

    end = datetime.now(timezone(timedelta(hours=5))).strftime("%Y-%m-%dT15:30:00+05:00")

    from pypsx import TradingClient

    client = TradingClient.from_env(paper=True)
    results = client.get_historical_intraday(
        [clean],
        start=start,
        end=end,
        interval=interval,
    )
    candles = []
    gaps = []
    hist_note = None
    if isinstance(results, list):
        for r in results:
            if not isinstance(r, dict):
                continue
            if str(r.get("symbol", "")).upper() == clean or len(results) == 1:
                candles = r.get("candles") or []
                gaps = r.get("gaps") or []
                hist_note = r.get("note")
                break
    elif isinstance(results, dict):
        candles = results.get("candles") or []
        gaps = results.get("gaps") or []
        hist_note = results.get("note")

    bars = _bars_from_historical_candles(candles)
    return {
        "symbol": clean,
        "interval": interval,
        "period": "all",
        "bars": bars,
        "count": len(bars),
        "gaps": gaps,
        "note": note or hist_note,
        "source": "pypsx:historical_intraday",
        "from": start,
        "to": end,
    }


def get_intraday_ohlcv(
    symbol: str,
    interval: str = "5m",
    period: str = "5d",
) -> dict[str, Any]:
    """
    Intraday OHLCV via authenticated pypsx SDK (same as Colab).
    Keys: PYPSX_API_KEY_ID + PYPSX_API_SECRET_KEY (server env only).
    Coverage roughly from 2025-10-20 onward.
    period=all|max → TradingClient.get_historical_intraday from coverage start.
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

    missing = _require_pypsx_keys()
    if missing:
        return missing

    try:
        import pypsx
    except ImportError:
        return {"error": "pypsx not installed", "hint": "pip install pypsx"}

    try:
        if period in ("all", "max"):
            return _intraday_all_via_historical(clean, interval)

        df = pypsx.get_intraday(clean, period=period, interval=interval)
        bars = _bars_from_df(df)
        if not bars:
            return {
                "symbol": clean,
                "interval": interval,
                "period": period,
                "bars": [],
                "count": 0,
                "source": "pypsx:intraday",
                "note": "No intraday bars (check market hours / coverage from 2025-10-20).",
            }

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
