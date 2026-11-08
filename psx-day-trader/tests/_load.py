"""Load a script from a skill folder (the folder names have hyphens) and point
every test at the saved PSX data in tests/fixtures (Friday 6 November 2026)."""

import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, "tests", "fixtures")
os.environ.setdefault("PSX_OFFLINE_DIR", FIX)
os.environ.setdefault("PSX_NOW", "2026-11-06 17:00")
sys.path.insert(0, os.path.join(ROOT, "psx-trader-common"))


def load(folder, name):
    path = os.path.join(ROOT, folder, name + ".py")
    spec = importlib.util.spec_from_file_location("psx_" + name.replace("-", "_"), path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
