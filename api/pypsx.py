"""Vercel Python function: pypsx-toolkit company info + chart analysis."""

from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json

from pypsx_lib import get_chart_analysis, get_company_info


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
            if mode == "company":
                symbol = (q.get("symbol") or q.get("company") or [""])[0]
                payload = get_company_info(symbol)
            elif mode == "analysis":
                symbol = (q.get("symbol") or q.get("analysis") or [""])[0]
                period = (q.get("period") or ["6mo"])[0]
                payload = get_chart_analysis(symbol, period)
            else:
                self._json(
                    400,
                    {"error": "mode required", "hint": "Use mode=company or mode=analysis"},
                )
                return

            if payload.get("error"):
                self._json(502, payload)
            else:
                self._json(200, payload)
        except Exception as exc:
            self._json(500, {"error": str(exc)})

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "s-maxage=300, stale-while-revalidate=3600")
        self.end_headers()
        self.wfile.write(body)
