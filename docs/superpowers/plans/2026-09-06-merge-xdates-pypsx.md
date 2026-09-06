# Merge Future X-Dates (Sheet + pyPSX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Future X-Dates and Upcoming Dividends combine Google sheet + pyPSX dividends for holdings **and watchlist** so gaps in either source still show up.

**Architecture:** Sheet remains primary market-wide source. pyPSX fills **holdings + watchlist** tickers via a lean `mode=dividends` endpoint. Pure merge by `ticker|exDate` with sheet winning on conflicts.

**Tech Stack:** TypeScript (Vitest), React, Vercel Python `api/pypsx.py` + `pypsx_toolkit`.

**Spec:** Chat design — hybrid sheet + pyPSX for holdings + watchlist (approved 2026-09-06).

## Global Constraints

- Do not loop all PSX symbols through pyPSX.
- Sheet wins when both have the same ticker + ex-date.
- pyPSX only queried for holdings ∪ watchlist tickers (deduped, capped).

---

### Task 1: Pure merge + date helpers (TDD)

**Files:**
- Create: `src/utils/xDateMerge.ts`
- Create: `src/utils/xDateMerge.test.ts`

- [ ] Write failing tests for `payoutDedupeKey`, `companyInfoToUpcomingPayouts`, `mergeXDatePayouts`
- [ ] Implement helpers
- [ ] Verify tests pass

### Task 2: Lean pyPSX dividends mode

**Files:**
- Modify: `api/pypsx_lib.py` — `get_dividend_snapshot(symbol)`
- Modify: `api/pypsx.py` — `mode=dividends`

- [ ] Return `{ symbol, latestDividend, dividendHistory }` only

### Task 3: Fetch + wire UI

**Files:**
- Modify: `src/services/financials.ts` — `fetchPypsxUpcomingForTickers`, `fetchUpcomingXDates`
- Modify: `src/components/UpcomingEventsScanner.tsx`
- Modify: `src/components/UpcomingDividends.tsx`
- Modify: `src/components/App.tsx` — pass `watchlist`

- [x] Fetch sheet + pyPSX in parallel; merge
- [x] Pass holdings + watchlist into both UIs
- [x] Run `npm test` (48 passed)
