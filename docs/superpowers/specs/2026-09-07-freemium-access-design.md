# Freemium Access (Trial → Free Caps → Paid) — Design

**Date:** 2026-09-07  
**Product:** PSX Tracker (PSX45)  
**Status:** Draft for user review  

## Goal

Replace the current all-or-nothing **15-day trial → hard Paywall** model with:

1. **7-day full trial** after owner approval  
2. Then **Free forever** with tight per-feature caps  
3. **Paid / Lifetime = unlimited** (and full data visibility again)  
4. **Remove Guest Mode** — account required  

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Post-signup model | Short full trial → Free limited (or Paid) |
| Trial length | **7 days** |
| Free aggressiveness | Tight Free; every tool has a Free restriction |
| Paid limits | **Unlimited** vs Free caps |
| Guest Mode | **Removed** |
| AI Free | **10 messages / day** |
| “First 3” order | Earliest distinct symbols by **first transaction date** |
| Sold positions | Count toward lifetime first-3 entitlement |
| Lapsed Paid | App stays usable; hide data beyond first-3 until Paid again |
| Export | Blocked on Free |
| Import | Unlimited runs; only first-3 tickers/funds may be applied on Free |
| Simulator | Unlimited on Free |
| Fund bank accounts | No separate Free “bank” tier — funds use fund portfolios only |
| Brokers | Same as portfolios (1 portfolio ↔ 1 broker on Free) |

## Non-goals

- Stripe / card billing (keep bank-transfer + owner `mark_paid`)  
- Changing owner-approval flow  
- Deleting user Drive data when Free  
- Public SEO / ticker pages  
- Redesigning chart UI beyond quota enforcement  

## Access states (new)

| State | Meaning | App |
|-------|---------|-----|
| `pending` | Not owner-approved | `PendingApproval` |
| `trial` | Within 7 days of `approved_at` | Full unlimited |
| `free` | Approved; trial ended; not paid | Caps + first-3 visibility |
| `paid` | `access_until` in future | Full unlimited + full history |
| `lifetime` | `lifetime=true` | Full unlimited |
| ~~`guest`~~ | Removed | — |
| ~~`expired` hard lock~~ | Replaced by `free` | No total lockout Paywall |

**Paywall / Upgrade UI:** shown when Free hits a cap or taps “Pay to see” — not as the only post-trial destination.

**Source of truth:** extend `lib/access.js` `computeAccess` + `POST /api/check-access` to return:

```ts
{
  approved: boolean
  active: boolean          // true for trial | free | paid | lifetime
  status: 'pending' | 'trial' | 'free' | 'paid' | 'lifetime'
  plan: 'trial' | 'free' | 'paid' | 'lifetime'
  trialEnds?: string | null
  daysLeft?: number | null
  accessUntil?: string | null
  lifetime: boolean
  quotas: FreemiumQuotas   // static Free numbers; ignored when plan is trial/paid/lifetime
}
```

`TRIAL_DAYS` default becomes **7** (env override still allowed).

## First-3 entitlement (stocks & funds)

### Definition

- A **ticker entitlement slot** is a distinct PSX symbol that appears in the user’s transaction history (buys **or** sells) or holdings.  
- Order = ascending **first transaction date** (then ticker as tie-break).  
- Free may **view and mutate** only the first **3** tickers in that order.  
- Same rule for **mutual fund** symbols: first **3** funds by first transaction date.  

### Lapse behavior (Paid → Free)

- Do **not** delete Drive/local data.  
- Filter UI + aggregates to entitled symbols only.  
- Hidden symbols reappear immediately when status returns to `paid` / `lifetime` / (optionally) new `trial` if owner restarts trial.  

### New activity on Free

- Adding a trade for a **4th** distinct ticker → block with Upgrade modal.  
- Import of a file containing extra tickers → apply only entitled rows; skip others with message.  

## Free vs Paid matrix

| Feature | Free | Paid / Trial / Lifetime |
|---------|------|-------------------------|
| Guest Mode | Removed | Removed |
| PSX portfolios | 1 | Unlimited |
| Brokers | 1 (tied to portfolio) | Unlimited |
| Mutual fund portfolios | 1 | Unlimited |
| Distinct stock tickers (view/use) | First 3 lifetime | All |
| Distinct fund tickers (view/use) | First 3 lifetime | All |
| Watchlist | Only within first-3 entitlement | Unlimited |
| Dashboard / holdings / P&L / history | Entitled symbols only | Full |
| Manual transactions | Within entitlement | Unlimited |
| Import (CSV / OCR / Gmail) | Unlimited runs; apply first-3 only | Full apply |
| Export | Blocked | Allowed |
| Charts | **5 symbol-views / day** | Unlimited |
| Market Signals | **1 run / day**; show **5** results; rest “Pay to see” | Full |
| Daily Scan Bot | **1 run / day**; show **5**; rest “Pay to see” | Full |
| Strategy Backtest | Runs allowed; non-Free detail **Pay to see** | Full |
| Price Alerts | **3 tickers** × **2 TP + 2 SL** each | Unlimited tickers |
| PSX Assistant | **10 messages / day** | Unlimited |
| Trading Simulator | Unlimited | Unlimited |
| Fair Value Calculator | **4 lookups / day** | Unlimited |
| Drive sync | Yes (signed in) | Yes |
| API keys | BYO | BYO |
| Admin Users | Owner only | Owner only |

## Usage counters

Daily quotas (charts, signals, scan, AI, fair value) reset on **Pakistan calendar day** (`Asia/Karachi`) unless product later chooses UTC.

Store counters:

- Prefer **server** (Supabase table keyed by email/user id + day) for signed-in users so Free cannot reset by clearing localStorage.  
- Fallback localStorage only if offline — reconcile on next online check.

## Enforcement architecture

### Recommended approach

**Entitlements + data filters + hard write/import/export gates** (Approach 1).

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Entitlements | `lib/access.js`, `api/check-access.js` | `status`/`plan`, `TRIAL_DAYS=7`, quotas payload |
| App gate | `App.tsx` | Remove Guest; map old `expired` → `free`; Upgrade modal vs hard Paywall |
| First-3 | util e.g. `src/utils/freemiumEntitlements.ts` | Compute from transactions; filter holdings/realized/history/dashboard |
| Writes | Portfolio create, broker add, trade add, watchlist, alerts | Block over-quota |
| Import / export | `TransactionForm` + export entry points | Filter apply; block export on Free |
| Tool quotas | Charts explorer, Signals, Daily Scan, Backtest, AI, Fair Value | Increment + blur “Pay to see” |
| Alerts API | `api/save-alert.js` | Enforce 3 tickers / 2 TP / 2 SL on Free |
| Marketing | `LoginPage`, `Paywall` → Upgrade | Copy: 7-day trial; Free forever limited; remove Guest CTA |

### Explicitly deferred (phase 2)

Gate every price/proxy API by plan (nice hardening; not required for v1 UX).

## UX

- Soft banner when `plan === 'free'`: “Free plan · first 3 tickers · Upgrade for full history”.  
- Trial banner: “Full access · N days left”.  
- Cap modal: which limit hit, what Paid unlocks, bank-transfer subscribe (reuse Paywall payment details).  
- “Pay to see” rows: blurred/locked list items with Upgrade CTA — do not omit the fact that more results exist.  

## Migration

| Existing user | Behavior |
|---------------|----------|
| Currently `trial` | Keep remaining trial, but duration rule becomes 7 days from `approved_at` (document: users past day 7 become Free) **or** grandfather remaining 15-day window once — **default: switch `TRIAL_DAYS` to 7 globally** |
| Currently `expired` (Paywall) | Become `free` with first-3 visibility on next access check |
| Currently `paid` / `lifetime` | Unchanged |
| Guests with local data | Guest entry removed; prompt sign-in; local data remains in browser until they sign in (no auto-merge required in v1) |

## Testing

- Unit: first-3 selection from mixed buy/sell history; filter helpers; quota day boundaries.  
- Unit: `computeAccess` returns `free` after trial without `access_until`.  
- Integration/UI: Free cannot export; import skips non-entitled tickers; chart 6th view blocked; signals show 5 + paywall rows.  
- Alerts API rejects 4th ticker / 3rd TP on Free.  

## Success criteria

- No Guest Mode entry on Login.  
- Post-trial users stay in app on Free.  
- Lapsed Paid users see only first-3 tickers/funds until Paid.  
- Matrix quotas enforced for Free; unlimited for Paid/trial/lifetime.  
- Export blocked on Free; import filtered to entitlement.  

## Open items resolved in this revision

- AI Free = 10/day  
- First 3 = first transaction date  

## Follow-ups (out of scope)

- Auto-billing  
- Server-side gating of all market data APIs  
- Merging anonymous local portfolios into new accounts  
