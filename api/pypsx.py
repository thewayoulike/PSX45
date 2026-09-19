"""Bounded, cached market-data gateway. No unbounded SDK work in the request process."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from pathlib import Path
from collections import OrderedDict
import json
import subprocess
import sys
import threading
import time

MARKET_DIR = Path(__file__).resolve().parents[1] / 'lib' / 'market'
sys.path.insert(0, str(MARKET_DIR))
from market_limits import validate_query, allowed_request

_SLOTS = threading.BoundedSemaphore(4)
_LOCK = threading.Lock()
_CACHE = OrderedDict()

def run_market(q):
    result = subprocess.run([sys.executable, str(MARKET_DIR / '_pypsx_worker.py'), json.dumps(q)],
                            capture_output=True, text=True, timeout=35, check=True)
    if len(result.stdout) > 8_000_000:
        raise ValueError('Response exceeds size limit')
    return json.loads(result.stdout)

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,OPTIONS')
        self.end_headers()

    def do_GET(self):
        self.cache_seconds = 15
        params = parse_qs(urlparse(self.path).query)
        keys = {'mode','symbol','symbols','company','dividends','analysis','intraday','quote','period','interval','index','name'}
        q = {k: v[0] for k, v in params.items() if k in keys}
        invalid = validate_query(q)
        if invalid:
            return self._json(400, {'error': invalid})
        try:
            ip = self.headers.get('x-forwarded-for', '').split(',')[0].strip() or str(self.client_address[0])
            if not allowed_request(ip):
                return self._json(429, {'error': 'Too many requests. Please retry shortly.'})
        except Exception:
            return self._json(503, {'error': 'Market-data service temporarily unavailable.'})
        self.cache_seconds = 21600 if q['mode'] == 'indices' else 300 if q['mode'] in {'company', 'dividends', 'analysis'} else 15
        key = json.dumps(q, sort_keys=True)
        with _LOCK:
            cached = _CACHE.get(key)
            if cached and cached[0] > time.monotonic():
                return self._json(200, cached[1])
        if not _SLOTS.acquire(blocking=False):
            return self._json(503, {'error': 'Market-data service busy. Please retry.'})
        try:
            payload = run_market(q)
            if payload.get('error') and not payload.get('quotes'):
                return self._json(502, {'error': 'Market data is temporarily unavailable.'})
            with _LOCK:
                _CACHE[key] = (time.monotonic() + self.cache_seconds, payload)
                _CACHE.move_to_end(key)
                while len(_CACHE) > 128:
                    _CACHE.popitem(last=False)
            return self._json(200, payload)
        except subprocess.TimeoutExpired:
            return self._json(504, {'error': 'Market-data request timed out. Please retry.'})
        except Exception:
            return self._json(502, {'error': 'Market data is temporarily unavailable.'})
        finally:
            _SLOTS.release()

    def _json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', f's-maxage={self.cache_seconds}, stale-while-revalidate=60' if status == 200 else 'no-store')
        if status in (429, 503): self.send_header('Retry-After', '60')
        self.end_headers()
        self.wfile.write(body)
