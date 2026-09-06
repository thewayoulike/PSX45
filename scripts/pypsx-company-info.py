#!/usr/bin/env python3
"""CLI wrapper — company info via api/pypsx_lib.get_company_info."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))

from pypsx_lib import get_company_info  # noqa: E402


def main():
    symbol = (sys.argv[1] if len(sys.argv) > 1 else "").strip().upper()
    if not symbol:
        print(json.dumps({"error": "symbol required"}))
        sys.exit(1)
    payload = get_company_info(symbol)
    print(json.dumps(payload))
    if payload.get("error"):
        sys.exit(3)


if __name__ == "__main__":
    main()
