# Unified Chart Settings Popup + Missing TA Overlays

**Date:** 2026-09-06  
**Status:** Draft for review  
**Product:** PSX45 StockChart

## Goal

Replace the three separate toolbar buttons (**Indicators**, **Trendlines**, **Momentum**) with **one** toolbar button that opens a single popup with **tabs**. Keep the **existing Indicators and Momentum UIs unchanged** (same controls, same apply flow content). Add new checkboxes for TA features that are currently missing/partial, defaulted **off**.

## Non-goals

- Do not redesign or restyle the current Indicators (Awais) panel content.
- Do not redesign or restyle the current Momentum panel content.
- Do not change Daily Scan / Market Signal Scanner / Backtest in this project (chart toggles only; scanner wiring can be a follow-up).
- Do not force-enable any new overlay by default.

## Current state

Toolbar today (candle mode):

- `IndicatorsPanel` — Awais MAs, BB, Supertrend, pivots, Ichimoku
- `AutoTrendlinesPanel` — auto support/resistance trendlines
- `MomentumPanel` — RSI / MACD / Stoch / ADX

Settings persist via `chartSettingsStorage` (`layers`, `awaisLayers`, `momentumConfig`, `autoTrendlines`).

## UI design

### Toolbar

- **One button:** `Chart` (icon: Layers or similar).
- Badge optional: count of active chart layers / enabled groups (can reuse existing Awais + momentum counters + new flags).
- Remove standalone Indicators / Trendlines / Momentum buttons from the toolbar.
- **Also move off the crowded toolbar into the Chart popup:**
  - **Chart length (range):** `1M` / `3M` / `6M` / `1Y` / `ALL` (and intraday ranges when on intraday intervals).
  - **Candle size (interval):** `1m` / `5m` / `15m` / `1h` / `Day` / `Week` / `Month`.
- Draw tools and H/Y zoom stay on the toolbar (pan/zoom while looking at the chart).
- Optional compact readout next to the Chart button showing current selection, e.g. `Day · ALL`, so the user still sees active length/interval without opening the popup.

### Popup shell

- Same modal pattern as today (centered dialog, Escape closes, body scroll lock, Ok / Cancel / Defaults).
- **Top row inside the popup (always visible above tabs):** two compact selectors
  - **Length** — segmented control or select for range (`1M` … `ALL`)
  - **Candle** — segmented control or select for interval (`1m` … `Month`)
  - Changing these updates draft state; **Ok applies** (same as other settings), OR apply immediately on change if we want live preview — **prefer apply on Ok** for consistency with Indicators/Momentum, except length/interval already reload data today so **apply immediately on select** is better UX (matches current toolbar). Spec decision: **interval and range apply immediately** when changed in the popup (trigger existing `selectRange` / `setCandleInterval` paths); other tabs still use draft → Ok.
- **Top-level tabs** (Overlays / Momentum keep their own inner Inputs/Style tabs as today):

| Tab | Content |
|-----|---------|
| **Overlays** | Existing `IndicatorsPanel` body **as-is** (including its own Inputs / Style / Visibility sub-tabs) |
| **Trendlines** | Existing `AutoTrendlinesPanel` body **as-is** |
| **Momentum** | Existing `MomentumPanel` body **as-is** (including its Inputs / Style sub-tabs) |
| **Structure** | New checkboxes (see below) |
| **Volume** | Volume panel toggle + new volume features |
| **Signals** | New signal overlays |

### Apply / draft behavior

- Single draft object for the whole popup covering: `awaisLayers`, `autoTrendlines`, `momentumConfig`, `chartLayers` (volume/momentum pane flags), and new `chartExtras` settings.
- **Ok** applies all tabs at once; **Cancel** discards; **Defaults** resets to product defaults (existing defaults + new extras off).
- Opening the popup snapshots current settings into draft (same as current panels).

### Preserve existing panels as components

Refactor existing panels so **dialog chrome** (button + modal frame) can live in a new `ChartSettingsPanel`, while **content** components remain reusable:

- `IndicatorsPanelContent` (already exists in `AwaisChartOverlays.tsx`)
- Extract `AutoTrendlinesPanelContent` from `AutoTrendlinesPanel.tsx`
- Extract `MomentumPanelContent` usage without the outer trigger button (content already exists)

Public standalone panel exports may remain as thin wrappers for compatibility, but StockChart uses only the unified shell.

## New settings model

Add persisted `chartExtras` (name TBD; suggest `chartExtras`) on `ChartUserSettings`:

```ts
interface ChartExtras {
  // Structure
  swingMarkers: boolean;
  marketStructure: boolean;      // HH / HL / LH / LL labels
  consolidationZones: boolean;

  // Volume
  volumeSpike: boolean;
  volumeConfirmBreaks: boolean;  // annotate/filter breakouts with volume

  // Signals
  breakoutMarkers: boolean;
  rsiDivergence: boolean;
  atrPane: boolean;
  vwap: boolean;
  candlePatterns: boolean;

  // Convenience
  emaTrio: boolean;              // quick EMA 20/50/200 (may map onto Awais MA slots when applied)
}
```

All default `false`.

Normalize unknown/legacy saves like other chart settings.

### Structure tab checkboxes

- Swing highs / lows markers  
- Market structure (HH / HL / LH / LL)  
- Consolidation zones  

### Volume tab

- Show volume panel (bind existing `layers.volume`)  
- Volume spike markers  
- Volume confirmation on breaks  

### Signals tab

- Breakout / breakdown markers  
- RSI divergence  
- ATR pane  
- VWAP  
- Candlestick patterns  
- EMA 20 / 50 / 200 preset (`emaTrio`)  

## Chart behavior (when toggled on)

| Feature | Behavior |
|---------|----------|
| Swing markers | Plot markers at pivots from existing `findSwingPivots` (same strength as trendlines or a shared default) |
| Market structure | Label consecutive swing relations as HH/HL/LH/LL |
| Consolidation zones | Auto boxes for recent tight ranges (simple ATR- or range-based heuristic) |
| Volume spike | Highlight bars where volume ≥ N × SMA(volume, 20); N default 2 |
| Volume confirm | When breakout markers on, only emphasize breaks with spike/above-average volume (or show confirm badge) |
| Breakout markers | Markers when close breaks auto trendline or prior swing level |
| RSI divergence | Labels on RSI pane (regular bullish/bearish vs last swing) |
| ATR pane | Sub-pane Wilder ATR (reuse Supertrend ATR helper) |
| VWAP | Session/intraday VWAP when interval is intraday; on daily, cumulative/typical VWAP from visible range (document limitation) |
| Candle patterns | Small set: doji, hammer, engulfing — marker above/below bar |
| EMA trio | When enabled via Ok, set three Awais MA slots to EMA 20/50/200 visible (does not destroy other slots unless necessary; prefer unused slots) |

## Implementation phases (same UI tabs; fill behavior in order)

**Phase A — Shell only**  
Unified popup + tabs hosting existing Overlays / Trendlines / Momentum content unchanged. No new drawing yet (Structure/Volume/Signals tabs can show checkboxes that persist but no-op until Phase B/C).

**Phase B — High ROI drawing**  
Swing markers, market structure, volume spike, breakout markers + volume confirm, RSI divergence, ATR pane.

**Phase C — Remaining**  
Consolidation zones, VWAP, candlestick patterns, EMA trio preset wiring.

Phase A must leave the chart visually identical when extras are off.

## Files (expected)

- `src/components/ChartSettingsPanel.tsx` — new unified shell  
- `src/components/StockChart.tsx` — replace three buttons with one  
- `src/components/AutoTrendlinesPanel.tsx` — extract content  
- `src/components/MomentumPanel.tsx` / `AwaisChartOverlays.tsx` — reuse content exports  
- `src/services/chartSettingsStorage.ts` — persist `chartExtras`  
- `src/utils/chartExtras.ts` (+ tests) — defaults, normalize, detectors  
- Overlay rendering hooks inside `StockChart` / candle SVG layers  

## Testing

- Unit tests for `normalizeChartExtras`, volume spike, structure labels, divergence detection, ATR series.
- Manual: toolbar shows one Chart button + compact `Day · ALL` label; range/interval change from popup reloads chart like today; Overlays/Momentum look identical; new extras off keeps current chart; Ok persists after reload.

## Success criteria

1. Toolbar is less crowded: one Chart button instead of Indicators + Trendlines + Momentum + range pills + interval pills.  
2. Chart length and candle size are selectable inside the Chart popup (apply immediately on change); toolbar shows a compact readout like `Day · ALL`.  
3. Existing Indicators and Momentum controls work as today inside their tabs.  
4. New features are checkable and persist; default chart unchanged.  
5. Phase B features visibly draw when enabled.

## Open decisions (defaults proposed)

- Button label: **Chart** (alt: Indicators).  
- Volume spike threshold: **2×** 20-bar average.  
- Pivot length for swings/structure: reuse auto-trendline pivot strength or fixed **5**.  
- Range + interval live in the Chart popup (immediate apply); Draw + H/Y zoom stay on the toolbar.  
