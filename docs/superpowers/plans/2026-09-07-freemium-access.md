# Freemium Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard post-trial Paywall with Free (capped) access: `expired` → `free`, 7-day trial, first-3 holdings filters, soft Upgrade UI, then matrix quotas.

**Architecture:** Server `computeAccess` becomes source of truth (`free` is `active: true`). Client stops lockouting on Free; filters holdings via entitlement helpers; Paywall becomes an Upgrade modal/sheet. Quotas use Pakistan calendar day counters (localStorage v1, server table deferred).

**Tech Stack:** Node `lib/access.js`, Vercel `api/check-access.js`, React `App.tsx` / `Paywall.tsx`, Vitest (`npm test`).

**Spec:** `docs/superpowers/specs/2026-09-07-freemium-access-design.md`

## Global Constraints

- `TRIAL_DAYS` default **7** (env override allowed).
- Free after trial/paid lapse: **never** hard-lock with full-screen Paywall as the only path.
- First-3 = distinct symbols by earliest transaction date (open or sold count).
- Paid alerts: **15 tickers × 4 TP + 4 SL**; Free alerts: **3 × 2 TP + 2 SL**.
- Export Free: **1/day**, first-3 only (not blocked entirely).
- Charts: empty until pick (already shipped helpers in `chartExplorerSelection.ts`).
- Tests: `npm test` (Vitest). TDD: fail → implement → pass.
- **Do not `git commit` unless the user explicitly asks** (user rule overrides plan commit steps).
- Prefer branch `cursor/freemium-access` from current `main`.

## Phases

| Phase | Ships | Unblocks user Paywall? |
|-------|--------|------------------------|
| **A** Tasks 1–5 | Access `free` + App gate + Upgrade UX + first-3 filters + Free banner | **Yes** |
| **B** Tasks 6–9 | Portfolios/brokers/watchlist/import write gates; export 1/day; alerts caps | Partial |
| **C** Tasks 10–12 | Charts/signals/scan/AI/FV daily quotas; profile 7 lifetime; Pay to see | Full matrix |

Execute **Phase A first** and verify production Paywall is gone before Phase B/C.

## File map

| File | Role |
|------|------|
| `lib/access.js` | `computeAccess` → `free`; quotas payload; TRIAL_DAYS=7 |
| `lib/access.test.js` or `src/utils/accessCompute.test.ts` | Unit tests for access states (prefer Node-compatible test next to lib, or Vitest importing via relative path) |
| `api/check-access.js` | Return `status`/`plan`/`quotas`; keep `accessStatus` alias for old clients |
| `src/services/auth.ts` | `AccessState` includes `free`; map API fields |
| `src/utils/freemiumEntitlements.ts` | First-3 + filters |
| `src/utils/freemiumEntitlements.test.ts` | Entitlement unit tests |
| `src/utils/freemiumQuotas.ts` | Daily counter helpers (Karachi day key) |
| `src/utils/freemiumQuotas.test.ts` | Quota day + increment tests |
| `src/components/UpgradeModal.tsx` | Soft upgrade (reuse Paywall payment UI) |
| `src/components/Paywall.tsx` | Refactor to shared payment body OR wrap Upgrade copy |
| `src/components/App.tsx` | Remove expired lockout; Free banner; wire filters / modal |
| `api/save-alert.js` | Enforce alert caps by plan |

---

### Task 1: `computeAccess` returns `free` (not `expired`)

**Files:**
- Create: `src/utils/accessCompute.test.ts` (Vitest; dynamic-import or duplicate pure logic testable from `lib/access.js` via relative import — if Vitest cannot import CJS from `lib/`, create `src/utils/accessCompute.ts` that mirrors rules and have `lib/access.js` stay in sync **OR** use `createRequire`. Preferred: move pure compute into `src/utils/accessCompute.ts`, re-export from `lib/access.js` for API — **keep single source:** implement in `lib/access.js` and test with:

```ts
// accessCompute.test.ts — import via Node createRequire if needed
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { computeAccess, TRIAL_DAYS } = require('../../lib/access.js');
```

- Modify: `lib/access.js`

**Interfaces:**
- Produces: `computeAccess(row) → { approved, active, status, plan, lifetime, accessUntil, trialEnds, daysLeft, quotas }`
- `status`/`plan`: `'pending' | 'trial' | 'free' | 'paid' | 'lifetime'`
- `active: true` for trial | free | paid | lifetime
- `quotas`: static Free numbers object (always present; clients ignore when not free)

- [ ] **Step 1: Write the failing test**

```ts
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { computeAccess } = require('../../lib/access.js');

describe('computeAccess freemium', () => {
  it('returns free (active) after trial with no access_until', () => {
    const approvedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeAccess({ approved: true, approved_at: approvedAt, access_until: null, lifetime: false });
    expect(r.status).toBe('free');
    expect(r.active).toBe(true);
    expect(r.plan).toBe('free');
  });

  it('uses 7-day trial by default', () => {
    const approvedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeAccess({ approved: true, approved_at: approvedAt, lifetime: false });
    expect(r.status).toBe('trial');
    expect(r.active).toBe(true);
    expect(r.daysLeft).toBeGreaterThan(0);
    expect(r.daysLeft).toBeLessThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/accessCompute.test.ts`  
Expected: FAIL (`expired` or missing `free` / `plan`)

- [ ] **Step 3: Write minimal implementation in `lib/access.js`**

```js
export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 7);

export const FREE_QUOTAS = {
  stockTickers: 3,
  fundTickers: 3,
  portfolios: 1,
  stockProfiles: 7,
  chartViewsPerDay: 5,
  signalsPerDay: 1,
  signalsVisible: 5,
  dailyScanPerDay: 1,
  dailyScanVisible: 5,
  alertsTickers: 3,
  alertsTp: 2,
  alertsSl: 2,
  aiMessagesPerDay: 10,
  fairValuePerDay: 4,
  exportPerDay: 1,
};

export const PAID_QUOTAS = {
  ...FREE_QUOTAS,
  stockTickers: Infinity,
  fundTickers: Infinity,
  portfolios: Infinity,
  stockProfiles: Infinity,
  chartViewsPerDay: Infinity,
  signalsPerDay: Infinity,
  signalsVisible: Infinity,
  dailyScanPerDay: Infinity,
  dailyScanVisible: Infinity,
  alertsTickers: 15,
  alertsTp: 4,
  alertsSl: 4,
  aiMessagesPerDay: Infinity,
  fairValuePerDay: Infinity,
  exportPerDay: Infinity,
};

// In computeAccess final branch (was expired):
return {
  approved: true,
  active: true,
  status: 'free',
  plan: 'free',
  lifetime: false,
  accessUntil: row.access_until || null,
  trialEnds: new Date(trialEnd).toISOString(),
  daysLeft: 0,
  quotas: FREE_QUOTAS,
};
// Also set plan on trial/paid/lifetime branches; attach PAID_QUOTAS for paid/lifetime/trial.
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/utils/accessCompute.test.ts`

---

### Task 2: Wire `check-access` + client `AccessStatus`

**Files:**
- Modify: `api/check-access.js` (JSON response)
- Modify: `src/services/auth.ts` (`AccessState`, `getAccessStatus` mapping)

**Interfaces:**
- Consumes: `computeAccess` fields from Task 1
- Produces API JSON: `{ active, status, accessStatus, plan, quotas, ... }` where `accessStatus === status` for back-compat

- [ ] **Step 1: Extend client types + mapping**

```ts
export type AccessState = 'pending' | 'trial' | 'free' | 'paid' | 'lifetime';
// remove 'expired' OR map: if (d.accessStatus === 'expired') treat as 'free'

export interface AccessStatus {
  approved: boolean;
  active: boolean;
  status: AccessState;
  plan: AccessState;
  lifetime: boolean;
  accessUntil?: string | null;
  trialEnds?: string | null;
  daysLeft?: number | null;
  quotas?: Record<string, number>;
  isNew?: boolean;
}
```

- [ ] **Step 2: Update API response**

```js
const access = computeAccess(existing || { approved: false });
return res.status(200).json({
  approved,
  pending: !approved,
  new: brandNew,
  active: access.active,
  status: access.status,
  accessStatus: access.status, // alias
  plan: access.plan || access.status,
  lifetime: access.lifetime,
  accessUntil: access.accessUntil,
  trialEnds: access.trialEnds,
  daysLeft: access.daysLeft,
  quotas: access.quotas || null,
});
```

- [ ] **Step 3: Manual smoke** — call `/api/check-access` for an expired trial email → `active: true`, `status: "free"`.

---

### Task 3: Remove hard Paywall gate; Free enters app

**Files:**
- Modify: `src/components/App.tsx` (~2030–2037 and auth paths that require `st.active`)
- Modify: `src/components/Paywall.tsx` → accept optional `variant: 'lockout' | 'upgrade'` and title copy for Free upgrade **or** Create `UpgradeModal.tsx` that embeds payment details

**Interfaces:**
- Consumes: `AccessStatus.status === 'free' | 'trial' | ...`
- Produces: App renders for Free; `showUpgrade` state opens modal

- [ ] **Step 1: Delete / bypass expired Paywall early-return**

Replace:

```tsx
if (blockStatus?.status === 'expired') {
  return <Paywall ... />;
}
```

With: treat `free` like active access (already `active: true` from API). Keep Paywall only if you need a force-subscribe flag (default: never). Map legacy `expired` → enter app:

```tsx
const status = blockStatus?.status === 'expired' ? 'free' : blockStatus?.status;
// Do not return <Paywall /> for free/expired
```

- [ ] **Step 2: Free / trial banners**

```tsx
if (st.status === 'free') {
  return (
    <div className="...">
      Free plan · first 3 tickers ·{' '}
      <button type="button" onClick={() => setShowUpgrade(true)}>Upgrade</button>
    </div>
  );
}
```

- [ ] **Step 3: Upgrade modal** — reuse Paywall body; title: “Upgrade to Paid”; subtitle mentions Free limits; dismissible (`Close` / backdrop), not full-screen lockout.

- [ ] **Step 4: Verify locally** — sign in as expired-trial user → app loads, banner visible, no “Your trial has ended” lockout.

---

### Task 4: First-3 entitlement helpers (TDD)

**Files:**
- Create: `src/utils/freemiumEntitlements.ts`
- Create: `src/utils/freemiumEntitlements.test.ts`

**Interfaces:**
- Produces:

```ts
export function firstEntitledTickers(
  transactions: { ticker: string; date: string }[],
  limit: number
): string[]; // uppercase, stable order by first date then ticker

export function filterTransactionsByTickers<T extends { ticker: string }>(
  txs: T[],
  allowed: Set<string> | string[]
): T[];

export function isTickerEntitled(ticker: string, allowed: string[]): boolean;
```

- [ ] **Step 1: Failing tests**

```ts
it('orders by earliest transaction date and includes sold symbols', () => {
  const allowed = firstEntitledTickers([
    { ticker: 'LUCK', date: '2024-06-01' },
    { ticker: 'OGDC', date: '2024-01-01' },
    { ticker: 'OGDC', date: '2024-12-01' },
    { ticker: 'PPL', date: '2024-02-01' },
    { ticker: 'HBL', date: '2024-03-01' },
  ], 3);
  expect(allowed).toEqual(['OGDC', 'PPL', 'HBL']);
});
```

- [ ] **Step 2: Run — expect FAIL**  
`npm test -- src/utils/freemiumEntitlements.test.ts`

- [ ] **Step 3: Implement `firstEntitledTickers`**

```ts
export function firstEntitledTickers(
  transactions: { ticker: string; date: string }[],
  limit: number,
): string[] {
  const first = new Map<string, string>();
  for (const t of transactions) {
    const sym = (t.ticker || '').trim().toUpperCase();
    if (!sym) continue;
    const d = t.date || '';
    const prev = first.get(sym);
    if (prev == null || d < prev) first.set(sym, d);
  }
  return [...first.entries()]
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0].localeCompare(b[0])))
    .slice(0, limit)
    .map(([sym]) => sym);
}
```

- [ ] **Step 4: Run — expect PASS**

---

### Task 5: Apply first-3 filters in App (Free only)

**Files:**
- Modify: `src/components/App.tsx` — where `portfolioTransactions` / holdings feed dashboard, holdings table, history, realized

**Interfaces:**
- Consumes: `sbStatus` / access plan + `firstEntitledTickers`
- Produces: `visibleTransactions` used by Free UI; Paid/trial/lifetime use full list

- [ ] **Step 1: Compute entitlement when `plan === 'free'`**

```tsx
const accessPlan = (sbStatus?.plan || sbStatus?.status || pendingStatus?.status) as string;
const isFreePlan = accessPlan === 'free' || accessPlan === 'expired';
const entitledTickers = isFreePlan
  ? firstEntitledTickers(portfolioTransactions, 3)
  : null;
const visibleTransactions = entitledTickers
  ? filterTransactionsByTickers(portfolioTransactions, entitledTickers)
  : portfolioTransactions;
```

Wire `visibleTransactions` into holdings/dashboard/history/realized paths (same places that already consume `portfolioTransactions` for display). Keep raw `transactions` in state for Drive sync (do not delete).

- [ ] **Step 2: Block adding a 4th ticker** in the transaction-add path — if Free and ticker not entitled and entitled.length >= 3 → `setShowUpgrade(true)` and return.

- [ ] **Step 3: Manual check** — Free user with 5 tickers sees only first 3 in holdings.

---

### Task 6: Portfolios / brokers / watchlist write gates

**Files:**
- Modify: portfolio create / broker add / watchlist add handlers in `App.tsx` (and any child forms)

- [ ] **Step 1:** Free: max 1 PSX portfolio + 1 fund portfolio + 1 broker; watchlist only entitled tickers.
- [ ] **Step 2:** Over-cap → Upgrade modal.

---

### Task 7: Export 1/day + first-3 filter

**Files:**
- Create/Modify: `src/utils/freemiumQuotas.ts` + tests
- Modify: export entry points (search `export` / Excel / CSV in `App.tsx` / History)

```ts
export function karachiDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function consumeDailyQuota(key: string, limit: number): { ok: boolean; used: number } {
  // localStorage `psx_quota_${key}_${karachiDayKey()}` → increment; ok if used < limit after increment attempt
}
```

- [ ] Free export: `consumeDailyQuota('export', 1)`; filter rows to entitled tickers; Paid skip limit.

---

### Task 8: Import apply filter

**Files:**
- Modify: import apply path in TransactionForm / App

- [ ] Free: apply only rows whose ticker is entitled or would fill remaining first-3 slots in first-seen order; skip rest with toast.

---

### Task 9: Alerts API + UI caps

**Files:**
- Modify: `api/save-alert.js`
- Modify: `src/components/AlertsPage.tsx`

- [ ] Free: max 3 symbols, 2 TP + 2 SL each; Paid: 15 symbols, 4 TP + 4 SL; reject with 403 + message.

---

### Task 10: Tool daily quotas (charts, signals, scan, AI, fair value)

**Files:**
- Modify: `ChartsExplorer.tsx` (count on successful symbol select when Free)
- Modify: Signals / Daily Scan / AI / Fair Value components

- [ ] Use `consumeDailyQuota`; Soft “Pay to see” for extra signal/scan rows beyond 5.
- [ ] Backtest: show locked detail rows with Upgrade CTA.

---

### Task 11: Stock profile browse (7 lifetime) + position lock

**Files:**
- Modify: stock profile open handler in `App.tsx`
- Persist: `localStorage` key `psx_free_profiles` = JSON string[] of tickers

- [ ] Free: opening 8th unique profile → Upgrade modal (unless already in set).
- [ ] Positions/trnx section: locked unless ticker in first-3 entitlement.

---

### Task 12: Guest Mode removal sweep

**Files:**
- Grep `guestMode` / `Guest` / `handleGuestLogin` in `App.tsx` and dead paths
- Confirm LoginPage already has no Guest CTA

- [ ] Remove remaining Guest bypasses that skip access checks.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| 7-day trial | 1 |
| expired → free active | 1–3 |
| Soft Upgrade not hard Paywall | 3 |
| First-3 holdings | 4–5 |
| Portfolios/brokers 1 | 6 |
| Export 1/day first-3 | 7 |
| Import filter | 8 |
| Alerts Free/Paid caps | 9 |
| Charts/signals/scan/AI/FV quotas | 10 |
| Profiles 7 + position lock | 11 |
| Guest removed | 12 |
| Charts empty default | Already done (prior) |

## Out of scope (this plan)

- Supabase server-side quota table (localStorage OK for v1)
- Gating every market-data API by plan
- Auto-billing / Stripe
