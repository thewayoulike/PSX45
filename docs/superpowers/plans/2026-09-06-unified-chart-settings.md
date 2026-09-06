# Unified Chart Settings + TA Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Chart toolbar button opens a tabbed settings popup (range + candle selectors, existing Overlays/Trendlines/Momentum content unchanged, new Structure/Volume/Signals toggles) and Phase B overlays draw when enabled.

**Architecture:** Persist a new `chartExtras` object beside existing chart settings. Extract existing panel *content* into reusable components hosted by `ChartSettingsPanel`. Detectors live in `src/utils/chartExtras*.ts` and render inside `StockChart` / candle SVG. Range and interval apply immediately from the popup; other settings use draft → Ok.

**Tech Stack:** React, TypeScript, Vitest (`npm test`), existing SVG candle chart in `StockChart.tsx`, `chartSettingsStorage.ts`.

**Spec:** `docs/superpowers/specs/2026-09-06-unified-chart-settings-design.md`

## Global Constraints

- Keep existing Indicators (Awais) and Momentum **content UI as-is** — only relocate into tabs.
- New extras default **off**; chart must look unchanged until user enables them.
- Do **not** redesign Daily Scan / Signals / Backtest in this plan.
- Tests run with `npm test` (Vitest). Follow TDD: failing test → implement → pass.
- **Do not `git commit` unless the user explicitly asks** (user rule overrides plan commit steps).
- Prefer small focused utils over growing `StockChart.tsx` further when adding detectors.

## File map

| File | Role |
|------|------|
| `src/utils/chartExtras.ts` | `ChartExtras` type, defaults, normalize, clone |
| `src/utils/chartExtras.test.ts` | Tests for extras model + detectors |
| `src/utils/chartStructure.ts` | Swing markers + HH/HL/LH/LL from pivots |
| `src/utils/chartVolumeSignals.ts` | Volume spike + confirm helper |
| `src/utils/chartBreakouts.ts` | Breakout/breakdown marker indices |
| `src/utils/chartRsiDivergence.ts` | RSI divergence labels |
| `src/utils/chartAtr.ts` | Export/reuse Wilder ATR series for pane |
| `src/services/chartSettingsStorage.ts` | Persist `chartExtras` |
| `src/components/ChartSettingsPanel.tsx` | Unified shell: Length/Candle + tabs |
| `src/components/AwaisChartOverlays.tsx` | Export `IndicatorsPanelContent` |
| `src/components/MomentumPanel.tsx` | Export `MomentumPanelContent` |
| `src/components/AutoTrendlinesPanel.tsx` | Export `AutoTrendlinesPanelContent` |
| `src/components/StockChart.tsx` | Wire one Chart button; remove old buttons + range/interval pills; render extras |

---

### Task 1: `ChartExtras` model + storage

**Files:**
- Create: `src/utils/chartExtras.ts`
- Create: `src/utils/chartExtras.test.ts`
- Modify: `src/services/chartSettingsStorage.ts`

**Interfaces:**
- Produces:
  - `ChartExtras` with boolean fields: `swingMarkers`, `marketStructure`, `consolidationZones`, `volumeSpike`, `volumeConfirmBreaks`, `breakoutMarkers`, `rsiDivergence`, `atrPane`, `vwap`, `candlePatterns`, `emaTrio`
  - `DEFAULT_CHART_EXTRAS` (all `false`)
  - `cloneChartExtras(s: ChartExtras): ChartExtras`
  - `normalizeChartExtras(raw: unknown): ChartExtras`
  - `ChartUserSettings.chartExtras: ChartExtras`

- [ ] **Step 1: Write failing tests**

```ts
// src/utils/chartExtras.test.ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHART_EXTRAS,
  cloneChartExtras,
  normalizeChartExtras,
} from './chartExtras';

describe('chartExtras', () => {
  it('defaults all flags off', () => {
    expect(Object.values(DEFAULT_CHART_EXTRAS).every((v) => v === false)).toBe(true);
  });

  it('normalize fills missing keys from defaults', () => {
    const n = normalizeChartExtras({ volumeSpike: true });
    expect(n.volumeSpike).toBe(true);
    expect(n.swingMarkers).toBe(false);
    expect(n.rsiDivergence).toBe(false);
  });

  it('clone is detached', () => {
    const c = cloneChartExtras(DEFAULT_CHART_EXTRAS);
    c.atrPane = true;
    expect(DEFAULT_CHART_EXTRAS.atrPane).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npm test -- --run src/utils/chartExtras.test.ts`  
Expected: FAIL load error / not a function

- [ ] **Step 3: Implement `chartExtras.ts` + wire storage**

Implement type + helpers. In `chartSettingsStorage.ts`:
- Add `chartExtras` to `ChartUserSettings` and `DEFAULT_CHART_SETTINGS`
- Clone/normalize/persist like `autoTrendlines`

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- --run src/utils/chartExtras.test.ts`

---

### Task 2: Export existing panel content components

**Files:**
- Modify: `src/components/AwaisChartOverlays.tsx` — `export function IndicatorsPanelContent` (already defined; add export)
- Modify: `src/components/MomentumPanel.tsx` — `export function MomentumPanelContent`
- Modify: `src/components/AutoTrendlinesPanel.tsx` — extract body into `export function AutoTrendlinesPanelContent({ draft, patch }: …)`

**Interfaces:**
- Produces: three content components usable without their own modal chrome
- Keep existing `IndicatorsPanel` / `MomentumPanel` / `AutoTrendlinesPanel` wrappers working (thin wrappers around content) for safety

- [ ] **Step 1: Export `IndicatorsPanelContent` and `MomentumPanelContent`**

Change `function IndicatorsPanelContent` → `export function IndicatorsPanelContent`.  
Same for Momentum.

- [ ] **Step 2: Extract `AutoTrendlinesPanelContent`**

Move the form fields (enable, support/resistance colors, pivot strength, min bars, extend, break & rebuild) into:

```tsx
export function AutoTrendlinesPanelContent({
  draft,
  patch,
}: {
  draft: AutoTrendlineSettings;
  patch: (p: Partial<AutoTrendlineSettings>) => void;
}) { /* existing form JSX */ }
```

Standalone `AutoTrendlinesPanel` keeps its button/modal and renders `<AutoTrendlinesPanelContent draft={draft} patch={patch} />`.

- [ ] **Step 3: Smoke-check TypeScript via build or vitest collect**

Run: `npm run build`  
Expected: success (or fix export-only typos)

---

### Task 3: `ChartSettingsPanel` shell (tabs + length/candle)

**Files:**
- Create: `src/components/ChartSettingsPanel.tsx`
- Modify: `src/components/StockChart.tsx` (wire later in Task 4; this task can develop panel in isolation)

**Interfaces:**
- Consumes: content components from Task 2; `ChartExtras` from Task 1
- Produces:

```tsx
export const ChartSettingsPanel: React.FC<{
  disabled?: boolean;
  // live chart identity (apply immediately)
  range: string;
  candleInterval: CandleInterval;
  onIntraday: boolean;
  ranges: { k: string }[];
  intervals: CandleInterval[]; // or fixed list
  onSelectRange: (k: string) => void;
  onSelectInterval: (iv: CandleInterval) => void;
  // draft-applied settings
  layers: ChartLayerToggles;
  awaisLayers: AwaisLayers;
  momentumConfig: MomentumConfig;
  autoTrendlines: AutoTrendlineSettings;
  chartExtras: ChartExtras;
  onApply: (next: {
    layers: ChartLayerToggles;
    awaisLayers: AwaisLayers;
    momentumConfig: MomentumConfig;
    autoTrendlines: AutoTrendlineSettings;
    chartExtras: ChartExtras;
  }) => void;
}>;
```

- [ ] **Step 1: Build modal shell**

- One toolbar trigger button labeled **Chart** (Layers icon).
- Compact subtitle on button or beside it is handled in StockChart (`Day · ALL`); button title `Chart settings`.
- Modal: Escape closes, body scroll lock (copy pattern from `MomentumPanel`).
- Above tabs: two rows of pills
  - Length: map `ranges` → buttons calling `onSelectRange` immediately
  - Candle: `1m|5m|15m|1h|day|week|month` calling `onSelectInterval` immediately
- Tabs: `Overlays | Trendlines | Momentum | Structure | Volume | Signals`
- Footer: Defaults / Cancel / Ok

- [ ] **Step 2: Host existing content in first three tabs**

- Overlays: local draft `awais` + inner sub-tabs Inputs/Style/Visibility using `IndicatorsPanelContent`
- Trendlines: `AutoTrendlinesPanelContent`
- Momentum: `MomentumPanelContent` with its Inputs/Style

On open, snapshot all drafts from props. Ok → `onApply(...)`. Defaults → reset drafts to `DEFAULT_*` + `DEFAULT_CHART_EXTRAS` + default layers.

- [ ] **Step 3: Structure / Volume / Signals checkbox lists**

Bind to `draftExtras` + `draftLayers.volume` on Volume tab. No chart drawing required yet — persistence only.

Structure:
- Swing highs/lows (`swingMarkers`)
- Market structure HH/HL/LH/LL (`marketStructure`)
- Consolidation zones (`consolidationZones`)

Volume:
- Show volume panel (`layers.volume`)
- Volume spike (`volumeSpike`)
- Volume confirmation on breaks (`volumeConfirmBreaks`)

Signals:
- Breakout/breakdown markers (`breakoutMarkers`)
- RSI divergence (`rsiDivergence`)
- ATR pane (`atrPane`)
- VWAP (`vwap`)
- Candlestick patterns (`candlePatterns`)
- EMA 20/50/200 preset (`emaTrio`)

---

### Task 4: Wire StockChart toolbar

**Files:**
- Modify: `src/components/StockChart.tsx`

- [ ] **Step 1: State + persist `chartExtras`**

```ts
const [chartExtras, setChartExtras] = useState(() =>
  cloneChartExtras(loadChartSettings().chartExtras ?? DEFAULT_CHART_EXTRAS)
);
// include chartExtras in persistChartSettings effect + CHART_SETTINGS_EVENT handler
```

- [ ] **Step 2: Replace toolbar controls**

Remove:
- Interval pill group
- Range pill group
- `<IndicatorsPanel />`, `<AutoTrendlinesPanel />`, `<MomentumPanel />`

Add:
- Compact text `fmtInterval(candleInterval) · {range}` (e.g. `Day · ALL`)
- `<ChartSettingsPanel … />` with props wired to existing `selectRange` / `selectInterval` / setters

Keep Draw tools, H zoom, Y zoom, refresh.

- [ ] **Step 3: Manual verify**

- Chart button opens popup; Overlays/Momentum match previous behavior after Ok
- Changing Length/Candle in popup reloads data like old pills
- Toolbar no longer shows three separate settings buttons or range/interval pills

---

### Task 5: Volume spike detector (TDD) + render

**Files:**
- Create: `src/utils/chartVolumeSignals.ts`
- Modify: `src/utils/chartExtras.test.ts` (or `chartVolumeSignals.test.ts`)
- Modify: `src/components/StockChart.tsx` (volume bars / candle markers)

**Interfaces:**
- Produces: `volumeSpikeFlags(volumes: number[], lookback = 20, mult = 2): boolean[]`

- [ ] **Step 1: Failing test**

```ts
it('flags bars where volume >= 2x SMA20', () => {
  const vols = Array(25).fill(100);
  vols[24] = 250;
  const flags = volumeSpikeFlags(vols, 20, 2);
  expect(flags[24]).toBe(true);
  expect(flags[23]).toBe(false);
});
```

- [ ] **Step 2: Implement + pass**

- [ ] **Step 3: Render when `chartExtras.volumeSpike`**

On volume panel SVG, tint spike bars (e.g. brighter fill) or draw a small triangle above the candle. Only when extras flag on.

---

### Task 6: Swing markers + market structure (TDD) + render

**Files:**
- Create: `src/utils/chartStructure.ts` (+ test file)
- Modify: candle SVG in `StockChart.tsx`

**Interfaces:**
- Consumes: `findSwingPivots` from `autoTrendlines.ts`
- Produces:

```ts
export type StructureLabel = 'HH' | 'HL' | 'LH' | 'LL';
export function labelSwingStructure(
  pivots: { i: number; price: number }[],
  kind: 'high' | 'low'
): { i: number; price: number; label: StructureLabel }[];
```

Rule: for highs, compare to previous high → HH if higher else LH; for lows → HL if higher else LL.

- [ ] **Step 1: Tests for labeling**

- [ ] **Step 2: Implement**

- [ ] **Step 3: Draw**

When `swingMarkers`: small dots at pivot highs/lows (visible viewport indices).  
When `marketStructure`: text labels HH/HL/LH/LL near those pivots.  
Use pivot length from `autoTrendlines.pivotLength` (or 5).

---

### Task 7: Breakout markers + volume confirm

**Files:**
- Create: `src/utils/chartBreakouts.ts` (+ tests)
- Modify: `StockChart.tsx`

**Interfaces:**
- Produces: indices where close crosses above resistance or below support auto-trendline after `i1`, optionally filtered by `volumeSpikeFlags` when `volumeConfirmBreaks`.

Reuse `extendTrendlineToIndex` + `computeAutoTrendlines` segments (even if trendlines overlay disabled — compute internally when `breakoutMarkers` on).

- [ ] **Step 1: TDD detector**

- [ ] **Step 2: Draw up/down arrows on break bars when `breakoutMarkers`**

If `volumeConfirmBreaks`, only draw when spike flag true on that bar (or show muted vs confirmed styles).

---

### Task 8: RSI divergence + ATR pane

**Files:**
- Create: `src/utils/chartRsiDivergence.ts` (+ tests)
- Create: `src/utils/chartAtr.ts` — export Wilder ATR (lift logic from `atrSeries` in `awaisIndicators.ts` or duplicate thin wrapper + export original)
- Modify: `StockChart.tsx` / momentum mini charts

**RSI divergence (regular):**
- Pivot lows in price with higher RSI lows → bullish
- Pivot highs in price with lower RSI highs → bearish
- Return `{ i, kind: 'bull' | 'bear' }[]` for last few

**ATR pane:**
- When `atrPane`, add a small SVG sub-pane under volume/momentum plotting ATR(14)

- [ ] **Step 1: TDD divergence on synthetic series**

- [ ] **Step 2: Implement ATR export + pane**

- [ ] **Step 3: Draw divergence markers on RSI pane when enabled**

---

### Task 9: Phase C leftovers (consolidation, VWAP, patterns, EMA trio)

**Files:**
- Extend `src/utils/chartExtras` detectors as needed
- Modify: `StockChart.tsx`, maybe Awais apply helper for EMA trio

- [ ] **Consolidation zones:** find stretches where `(max high − min low) / mid < threshold` over ≥ N bars; draw rects when `consolidationZones`

- [ ] **VWAP:** for intraday, typical cumulative VWAP from session start in visible/loaded bars; for daily, cumulative VWAP over visible window; line on main pane when `vwap`

- [ ] **Candle patterns:** detect doji / hammer / bullish+bearish engulfing on visible bars; mark when `candlePatterns`

- [ ] **EMA trio:** on Ok when `emaTrio` true, set Awais `ma1/ma2/ma3` (or first three slots) to EMA 20/50/200 enabled and `groups.ema = true` in the applied payload

Each sub-feature: write a focused unit test before implementation.

---

### Task 10: Verification

- [ ] **Step 1: Run full unit tests**

Run: `npm test -- --run`  
Expected: all pass

- [ ] **Step 2: Build**

Run: `npm run build`  
Expected: success

- [ ] **Step 3: Manual checklist**

- [ ] One Chart button; no duplicate Indicators/Trendlines/Momentum buttons  
- [ ] Length + candle in popup change chart  
- [ ] Toolbar shows `Day · ALL` (or current)  
- [ ] Overlays/Momentum identical to pre-change when configured the same  
- [ ] All new extras off → chart looks as before  
- [ ] Enabling volume spike / structure / breakouts / RSI div / ATR visibly works  

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Unified Chart button | 3–4 |
| Length + candle in popup, immediate apply | 3–4 |
| Compact toolbar readout | 4 |
| Overlays/Trendlines/Momentum as-is | 2–3 |
| Structure/Volume/Signals checkboxes | 3 |
| Persist chartExtras | 1, 4 |
| Defaults off | 1 |
| Phase B: swings, structure, spike, breakouts, confirm, RSI div, ATR | 5–8 |
| Phase C: consolidation, VWAP, patterns, EMA trio | 9 |
| Keep Draw + H/Y on toolbar | 4 |

## Placeholder scan

None intentional. Commit steps omitted per user git rule.
