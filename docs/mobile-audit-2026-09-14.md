# Mobile audit and optimization

Date: 14 September 2026. Status: implemented locally; not deployed.

## Findings and changes

| ID | Finding | Implemented improvement |
| --- | --- | --- |
| M01 | Dashboard cards used fixed desktop grid dimensions and scaled content on phones. | Mobile cards now follow a natural-height single column, retaining saved order and visibility. Desktop keeps its grid. Offscreen mobile cards use browser rendering containment. |
| M02 | Large financial figures were cramped in small metric cells. | Responsive padding, wrapping values, and one-column metric cells below 375px. Tested with a Rs. 123,456,789.25 portfolio. |
| M03 | Invisible dashboard tooltips created horizontal overflow at 320px. | Hide inactive tooltips from layout overflow and constrain mobile popovers. Metric help also responds to keyboard focus. |
| M04 | Opening the explorer list left almost no chart width. | Phone list and chart occupy the available width individually. Selecting a permitted symbol closes the list on phones. Search and list controls have accessible names. |
| M05 | Chart toolbars consumed too much phone space. | Advanced controls are behind a Chart tools toggle. Drawing actions have text labels and accessible pressed state. Layer controls scroll horizontally when needed. |
| M06 | The 300-bar default made phone candles dense; zoom could appear ineffective with long histories. | Phone default is 60 bars. Zoom now operates on the capped window, so the first step reduces 60 to 48 even with 1,500 historical bars. Existing pan/history and explicit fit-all remain available. |
| M07 | Touch panning could compete with page scrolling. | Default chart panning allows vertical browser scrolling and reserves horizontal movement for chart panning. Touch no longer starts vertical price panning. Physical-device gesture validation remains required. |
| M08 | Allocation plots and legends reserved excessive height; small labels depended on hover. | Shorter phone donut, no crowded slice labels, tappable legend rows with values and percentages, wrapping names, bounded legend scrolling, and reduced animation/filter work. |
| M09 | Performance chart used a fixed ±10% axis, clipping larger returns. | Automatic range includes the actual series. Shorter phone plot, clearer tick spacing, and no per-point dots/entrance animation on phones. Reduced-motion preference also disables chart animation. |
| M10 | Small controls and input text were awkward on phones. | Phone buttons/selects have a 44px minimum target; text inputs/selects use 16px text. App header and main flex sizing use available width. Settings modal respects dynamic viewport height. |
| M11 | Closed mobile navigation could remain keyboard-accessible. | Hidden drawer is inert; open drawer has dialog semantics, focus containment, Escape dismissal, focus restoration, and safe-area padding. |
| M12 | Stock chart code was part of the initial app module. | Lazy-load ChartsExplorer and TickerPerformanceList with a visible loading state; their shared StockChart module is split out. Hidden browser tabs no longer trigger the stock chart's periodic refresh. |

## Verification

- `npm test`: **197 tests passed in 34 files**, including two additional chart zoom regressions.
- `npm run build`: passed. Main application module decreased from approximately **2,057.56 kB to 1,846.47 kB** minified (about **10.3%**); gzip decreased from **530.52 kB to 482.57 kB** (about **9.0%**). Other shared/vendor code remains substantial.
- PWA precaching still includes the deferred modules. Splitting reduces initial module parsing/execution, but does **not** establish a reduction in total install/cache traffic or a measured speed score.
- `npx tsc -p src/tsconfig.json --noEmit`: **67 pre-existing diagnostics**, with no additional diagnostic messages compared with the saved source baseline after normalizing line numbers.
- Real browser checks used the production components with local synthetic data in `tests/mobile/index.html`. Dashboard, allocation, performance, candle renderer, and empty-symbol chart controls had **no page-width overflow at 320, 360, 390, 430, 768, and 1024px**. Performance also fit an 844×390 landscape viewport.
- Visually inspected narrow-phone dashboard, allocation, performance, candle renderer, expanded tools, stock picker, and dark allocation chart. The synthetic performance series from **−20% to +38%** remained in range.
- At 320px, the stock picker used the available panel width (290px after fixture margins), the chart controls expanded without overflow, and selects computed to 16px text.
- Menu check confirmed focus enters Close menu, Escape closes it, focus returns to the opener, and the closed drawer is inert.

## Limits and next priorities

This is a source audit plus browser viewport testing, not a complete physical-device certification. The fixture does not authenticate, mutate a portfolio, or simulate live trading. The explorer list was empty in the local API environment; live selection-to-chart loading needs a connected-session check. Holdings and transaction history already provide separate mobile cards; their full populated interaction flows were not browser-tested in this pass.

1. Validate iOS Safari and Android Chrome touch pan, pinch behavior, drawing tools, keyboard-open forms, safe areas, and installed-PWA rotation on real hardware.
2. Run authenticated end-to-end checks for portfolio selection, adding/editing transactions, fund holdings, stock selection, and long history lists at 320px and 390px.
3. Profile a production build on a throttled low-end phone before further splitting heavy export/AI dependencies or changing PWA caching. Record LCP, INP, memory, and scroll performance rather than inferring speed from bundle size.
4. Consider a dedicated accessible chart data table and an optional full-screen landscape chart as separate additions. These are recommendations, not implemented features.

## Reproduce

Start `npm run dev -- --host 127.0.0.1`, then open `http://127.0.0.1:3000/tests/mobile/index.html`. Choose a fixture view and resize the browser. The fixture is not a production entry and uses synthetic data; Explorer alone may request the app's public market-data API. Test actual authenticated workflows separately.

