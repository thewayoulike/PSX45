#!/usr/bin/env python3
"""CLI wrapper around pypsx_toolkit company info (fundamentals, dividends, description)."""

import json
import sys


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


def main():
    symbol = (sys.argv[1] if len(sys.argv) > 1 else "").strip().upper()
    if not symbol:
        print(json.dumps({"error": "symbol required"}))
        sys.exit(1)

    try:
        import pypsx_toolkit
    except ImportError:
        print(
            json.dumps(
                {
                    "error": "pypsx-toolkit not installed",
                    "hint": "pip install pypsx-toolkit",
                }
            )
        )
        sys.exit(2)

    try:
        div_info = pypsx_toolkit.get_dividend_info(symbol)
        div_hist = pypsx_toolkit.get_dividend_history(symbol)
        description = pypsx_toolkit.get_business_description(symbol)
        fund_df = pypsx_toolkit.get_company_fundamentals(symbol)

        info_rows = df_records(div_info)
        hist_rows = df_records(div_hist)

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

        payload = {
            "symbol": symbol,
            "businessDescription": description or "",
            "fundamentals": fundamentals_sections(fund_df),
            "latestDividend": normalize_latest(info_rows[0] if info_rows else None),
            "dividendHistory": normalize_history(hist_rows),
            "source": "pypsx",
        }
        print(json.dumps(payload))
    except Exception as exc:
        print(json.dumps({"error": str(exc), "symbol": symbol}))
        sys.exit(3)


if __name__ == "__main__":
    main()
