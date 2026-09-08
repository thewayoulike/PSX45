# Awais + Momentum Pine Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Momentum Panel and Awais Custom Indicator Panel to 100% parity with the TradingView Pine docs (`Momentum Panel Selector.docx`, `Awais Custom Indicator Panel V1.docx`).

**Architecture:** Extend pure compute modules (`momentumIndicators.ts`, `awaisIndicators.ts`, new `pivotPointLevels.ts`) with full settings + formulas; wire UI in Chart Settings; keep candle SVG renderers; add ADX ±DI and Supertrend markers; enable Awais on line charts where feasible.

**Tech Stack:** TypeScript, Vitest, React SVG chart overlays, existing Chart Settings panel.

**Spec:** Cross-match audit vs Downloads Word docs (2026-09-07); Pine sources extracted to conversation.

## Global Constraints

- TDD: failing test first for every compute change; run Vitest before claiming done.
- Do not `git commit` unless the user explicitly asks.
- Preserve persisted `psx_chart_settings` via migration/normalization (missing fields get Pine defaults).
- Traditional pivot math must stay identical; new types add formulas without breaking Traditional.
- Scanner/trade-plan monthly S1/R1 (`pivotLevels.ts`) stays Traditional monthly unless separately requested.

## File map

| File | Role |
|------|------|
| `src/utils/momentumIndicators.ts` | +DI/−DI series; ADX plot parity |
| `src/utils/momentumIndicators.test.ts` | Momentum / ADX DI tests |
| `src/components/MomentumPanel.tsx` | Plot +DI/−DI; DI color settings |
| `src/utils/awaisIndicators.ts` | 6th MA; BB/ST/Ichi params; lagging span; ST signals; pivot types/anchors/history |
| `src/utils/pivotPointLevels.ts` | Traditional/Fib/Woodie/Classic/DM/Camarilla from HLC |
| `src/utils/pivotPointLevels.test.ts` | Pivot type formula tests |
| `src/utils/awaisIndicators.test.ts` | MA6, BB params, Ichimoku lagging, ST markers, anchors |
| `src/components/AwaisChartOverlays.tsx` | UI for new inputs; render lagging span + ST markers |
| `src/components/ChartSettingsPanel.tsx` | Expose new settings tabs/fields |
| `src/components/StockChart.tsx` | Pass new settings; Awais on line mode if needed |
| `src/services/chartSettingsStorage.ts` | Normalize/migrate new fields |

---

### Task 1: ADX +DI / −DI (Momentum)

**Files:** `momentumIndicators.ts`, `momentumIndicators.test.ts`, `MomentumPanel.tsx`

- [ ] **Step 1:** Failing tests — `computeMomentumSeries` exposes `plusDi` / `minusDi`; threshold hline still present.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Return +DI/−DI from existing DMI math; add optional `plusDiColor` / `minusDiColor` defaults (green/red).
- [ ] **Step 4:** Plot both in ADX mini-chart; Style inputs.
- [ ] **Step 5:** Tests pass.

---

### Task 2: Sixth MA line (Awais)

**Files:** `awaisIndicators.ts`, tests, UI

- [ ] **Step 1:** Failing tests — `MA_SLOTS` includes `ma6`; defaults Pine: ma3=20 disabled, ma4=50, ma5=100, ma6=200 (migrate old ma3=50 users carefully).
- [ ] **Step 2–4:** Implement slot + UI + migration: if saved config has only 5 slots, insert ma3=20/off and shift… **Safer migration:** add `ma6` only with period 200; change defaults for *new* users to Pine layout; document that existing saved MAs keep periods.
- [ ] **Step 5:** Pass.

**Default (new installs) matching Pine:**

| Slot | Period | Enabled | Color |
|------|--------|---------|-------|
| ma1 | 5 | on | `#97F592` |
| ma2 | 10 | on | `#15A24B` |
| ma3 | 20 | **off** | `#100c09` |
| ma4 | 50 | on | `#f22828` |
| ma5 | 100 | on | `#e6b00c` |
| ma6 | 200 | on | `#7b49e7` |

---

### Task 3: Bollinger inputs (length, mult, source, offset)

- [ ] Tests for configurable BB; implement `bbConfig` on layers; UI Inputs; SVG respects offset.

---

### Task 4: Supertrend inputs + buy/sell markers

- [ ] Tests for ATR method toggle + flip markers (`buy`/`sell` indices).
- [ ] Implement settings + circle markers on chart.

---

### Task 5: Ichimoku lagging span + default ON + editable lengths

- [ ] Tests for lagging span series (close shifted); default group `ichimoku: true`.
- [ ] Render lagging span; Inputs for 9/26/52/displacement.

---

### Task 6: Pivot types (Fib, Woodie, Classic, DM, Camarilla)

- [ ] Pure formula tests in `pivotPointLevels.test.ts` (known H/L/C → levels).
- [ ] Wire into `computeAwaisOverlays`; UI type select.

---

### Task 7: Extra anchors + pivots back + display options

- [ ] Anchors: Biyearly…Decennially (year multipliers).
- [ ] `maxHistoricalPivots` (draw N prior periods when history allows).
- [ ] Label position Left/Right, show labels/prices, line width, per-level colors (optional but required for 100%).
- [ ] `useDailyBasedValues` — on day charts always daily OHLC of anchor; document PSX EOD limitation for true intraday.

---

### Task 8: Awais overlays on line chart

- [ ] Render same SVG overlays when line mode has OHLC available (StockChart already has ohlc).

---

### Task 9: Verification

- [ ] `vitest` for all new/updated tests green.
- [ ] Manual checklist: Chart Settings → enable each gap feature; OGDC candle matches expected S1 vs Traditional.

## Out of scope / honesty notes

- Exact TradingView `request.security` multi-year edge cases may differ slightly on sparse PSX history.
- Technical (Recharts) mode remaining on API RSI/MACD is a separate follow-up unless Task 9 expands it.
