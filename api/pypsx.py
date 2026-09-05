"""Vercel Python function: pypsx-toolkit company info + chart analysis."""

from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import importlib.util
import json
from pathlib import Path

_LIB = None


def _load_lib():
    """Lazy-load pypsx_lib (Vercel may not resolve sibling imports at module init)."""
    global _LIB
    if _LIB is not None:
        return _LIB
    try:
        from pypsx_lib import get_chart_analysis, get_company_info, get_intraday_ohlcv

        _LIB = (get_company_info, get_chart_analysis, get_intraday_ohlcv)
        return _LIB
    except ImportError:
        lib_file = Path(__file__).with_name("pypsx_lib.py")
        spec = importlib.util.spec_from_file_location("pypsx_lib", lib_file)
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot load pypsx_lib from {lib_file}")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _LIB = (mod.get_company_info, mod.get_chart_analysis, mod.get_intraday_ohlcv)
        return _LIB


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        q = parse_qs(parsed.query)
        mode = (q.get("mode") or [""])[0].strip().lower()

        try:
            get_company_info, get_chart_analysis, get_intraday_ohlcv = _load_lib()
            if mode == "company":
                symbol = (q.get("symbol") or q.get("company") or [""])[0]
                payload = get_company_info(symbol)
            elif mode == "analysis":
                symbol = (q.get("symbol") or q.get("analysis") or [""])[0]
                period = (q.get("period") or ["6mo"])[0]
                payload = get_chart_analysis(symbol, period)
            elif mode == "intraday":
                symbol = (q.get("symbol") or q.get("intraday") or [""])[0]
                interval = (q.get("interval") or ["5m"])[0]
                period = (q.get("period") or ["5d"])[0]
                payload = get_intraday_ohlcv(symbol, interval=interval, period=period)
            else:
                self._json(
                    400,
                    {
                        "error": "mode required",
                        "hint": "Use mode=company, mode=analysis, or mode=intraday",
                    },
                )
                return

            if payload.get("error"):
                self._json(502, payload)
            else:
                # Intraday moves faster — shorter CDN cache
                cache = (
                    "s-maxage=60, stale-while-revalidate=300"
                    if mode == "intraday"
                    else "s-maxage=300, stale-while-revalidate=3600"
                )
                self._json(200, payload, cache=cache)
        except Exception as exc:
            self._json(500, {"error": str(exc)})

    def _json(self, status: int, payload: dict, cache: str = "s-maxage=300, stale-while-revalidate=3600"):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(body)
