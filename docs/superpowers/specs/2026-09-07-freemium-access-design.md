# Freemium Access (Trial → Free Caps → Paid) — Design

**Date:** 2026-09-07  
**Product:** PSX Tracker (PSX45)  
**Status:** Approved (revised 2026-09-07)

## Goal

Replace the current all-or-nothing **15-day trial → hard Paywall** model with:

1. **7-day full trial** after owner approval  
2. Then **Free forever** with tight per-feature caps  
3. **Paid / Lifetime** unlocks full history and higher caps (see matrix — not every Paid cell is literally infinite)  
4. **Remove Guest Mode** — account required  

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Post-signup model | Short full trial → Free limited (or Paid) |
| Trial length | **7 days** |
| Free aggressiveness | Tight Free; every tool has a Free restriction |
| Guest Mode | **Removed** |
| AI Free | **10 messages / day** |
| “First 3” order | Earliest distinct symbols by **first transaction date** |
| Sold positions | Count toward lifetime first-3 entitlement |
| Lapsed Paid | App stays usable; hide holdings data beyond first-3 until Paid again |
| Export | Free: **1 / day**, first-3 tickers only; Paid: unlimited |
| Import | Unlimited runs; only first-3 tickers/funds may be applied on Free |
| Simulator | Unlimited on Free |
| Stock profiles | Free: **7 unique tickers lifetime** (company info); positions only for first-3 |
| Sector pages | Free: **no separate cap** (any sector) |
| Price Alerts | Free: **3 tickers × 2 TP + 2 SL**; Paid: **15 tickers × 4 TP + 4 SL** |
| Charts default | **No auto-load** — empty until user picks a symbol |
| Fund bank accounts | No separate Free “bank” tier — funds use fund portfolios only |
| Brokers | Same as portfolios (1 portfolio ↔ 1 broker on Free) |

## Non-goals

- Stripe / card billing (keep bank-transfer + owner `mark_paid`)  
- Changing owner-approval flow  
- Deleting user Drive data when Free  
- Public SEO / ticker pages  

## Access states (new)

| State | Meaning | App |
|-------|---------|-----|
| `pending` | Not owner-approved | `PendingApproval` |
| `trial` | Within 7 days of `approved_at` | Full (Paid-level) access |
| `free` | Approved; trial ended; not paid | Caps + first-3 visibility |
| `paid` | `access_until` in future | Paid caps + full history |
| `lifetime` | `lifetime=true` | Paid-level unlimited where matrix says so |
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
  quotas: FreemiumQuotas   // static Free/Paid numbers; ignored when plan is trial/lifetime if product treats those as Paid caps
}
```

`TRIAL_DAYS` default becomes **7** (env override still allowed).

## First-3 entitlement (stocks & funds)

### Definition

- A **ticker entitlement slot** is a distinct PSX symbol that appears in the user’s transaction history (buys **or** sells) or holdings.  
- Order = ascending **first transaction date** (then ticker as tie-break).  
- Free may **view and mutate holdings** only for the first **3** tickers in that order.  
- Same rule for **mutual fund** symbols: first **3** funds by first transaction date.  

### Lapse behavior (Paid → Free)

- Do **not** delete Drive/local data.  
- Filter holdings / P&L / history / export to entitled symbols only.  
- Hidden symbols reappear immediately when status returns to `paid` / `lifetime` / (optionally) new `trial` if owner restarts trial.  

### New activity on Free

- Adding a trade for a **4th** distinct ticker → block with Upgrade modal.  
- Import of a file containing extra tickers → apply only entitled rows; skip others with message.  

## Stock profiles (browse vs holdings)

| | Free | Paid / Trial / Lifetime |
|---|------|-------------------------|
| Open stock profile (company info) | **7 unique tickers lifetime** | Unlimited |
| Sector pages | **Unlimited** | Unlimited |
| Positions / transactions on profile | Only for **first-3 entitled** holdings; else locked + Upgrade CTA | Full |

Opening a profile counts toward the 7 even if the user does not hold the ticker. Company fundamentals stay visible within those 7; portfolio position/ledger UI stays locked unless the ticker is in the first-3 holdings entitlement.

## Free vs Paid matrix

| Feature | Free | Paid / Trial / Lifetime |
|---------|------|-------------------------|
| Guest Mode | Removed | Removed |
| PSX portfolios | 1 | Unlimited |
| Brokers | 1 (tied to portfolio) | Unlimited |
| Mutual fund portfolios | 1 | Unlimited |
| Distinct stock tickers (holdings) | First 3 lifetime | All |
| Distinct fund tickers (holdings) | First 3 lifetime | All |
| Stock profiles (company info) | **7 lifetime** | Unlimited |
| Sector pages | Unlimited | Unlimited |
| Profile positions / trnx | First-3 entitled only | Full |
| Watchlist | Only within first-3 entitlement | Unlimited |
| Dashboard / holdings / P&L / history | Entitled symbols only | Full |
| Manual transactions | Within entitlement | Unlimited |
| Import (CSV / OCR / Gmail) | Unlimited runs; apply first-3 only | Full apply |
| Export | **1 / day**; first-3 tickers only | Unlimited |
| Charts | **5 symbol-views / day**; **no default symbol** (user must pick) | Unlimited views; same empty-until-pick UX |
| Market Signals | **1 run / day**; show **5** results; rest “Pay to see” | Full |
| Daily Scan Bot | **1 run / day**; show **5**; rest “Pay to see” | Full |
| Strategy Backtest | Runs allowed; non-Free detail **Pay to see** | Full |
| Price Alerts | **3 tickers** × **2 TP + 2 SL** each | **15 tickers** × **4 TP + 4 SL** each |
| PSX Assistant | **10 messages / day** | Unlimited |
| Trading Simulator | Unlimited | Unlimited |
| Fair Value Calculator | **4 lookups / day** | Unlimited |
| Drive sync | Yes (signed in) | Yes |
| API keys | BYO | BYO |
| Admin Users | Owner only | Owner only |

## Usage counters

Daily quotas (charts, signals, scan, AI, fair value, **export**) reset on **Pakistan calendar day** (`Asia/Karachi`) unless product later chooses UTC.

Store counters:

- Prefer **server** (Supabase table keyed by email/user id + day) for signed-in users so Free cannot reset by clearing localStorage.  
- Fallback localStorage only if offline — reconcile on next online check.

Lifetime counters:

- First-3 holdings entitlement (from transactions)  
- Stock profile browse set (up to 7 unique tickers)  

## Enforcement architecture

### Recommended approach

**Entitlements + data filters + hard write/import/export gates** (Approach 1).

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Entitlements | `lib/access.js`, `api/check-access.js` | `status`/`plan`, `TRIAL_DAYS=7`, quotas payload |
| App gate | `App.tsx` | Remove Guest; map old `expired` → `free`; Upgrade modal vs hard Paywall |
| First-3 | util e.g. `src/utils/freemiumEntitlements.ts` | Compute from transactions; filter holdings/realized/history/dashboard |
| Profile browse | same util + stock profile view | Track 7 lifetime opens; lock positions outside first-3 |
| Writes | Portfolio create, broker add, trade add, watchlist, alerts | Block over-quota |
| Import / export | `TransactionForm` + export entry points | Filter apply; Free export 1/day + first-3 only |
| Tool quotas | Charts explorer, Signals, Daily Scan, Backtest, AI, Fair Value | Increment + blur “Pay to see” |
| Charts UX | `ChartsExplorer` | Empty until pick; no OGDC / list[0] auto-load |
| Alerts API | `api/save-alert.js` | Free: 3 tickers / 2 TP / 2 SL; Paid: 15 / 4 TP / 4 SL |
| Marketing | `LoginPage`, `Paywall` → Upgrade | Copy: 7-day trial; Free forever limited; remove Guest CTA |

### Explicitly deferred (phase 2)

Gate every price/proxy API by plan (nice hardening; not required for v1 UX).

## UX

- Soft banner when `plan === 'free'`: “Free plan · first 3 tickers · Upgrade for full history”.  
- Trial banner: “Full access · N days left”.  
- Cap modal: which limit hit, what Paid unlocks, bank-transfer subscribe (reuse Paywall payment details).  
- “Pay to see” rows: blurred/locked list items with Upgrade CTA — do not omit the fact that more results exist.  
- Charts empty state: “Load a chart” + open stock list; only `?symbol=` deep links auto-select.  

## Migration

| Existing user | Behavior |
|---------------|----------|
| Currently `trial` | Keep remaining trial, but duration rule becomes 7 days from `approved_at` (document: users past day 7 become Free) **or** grandfather remaining 15-day window once — **default: switch `TRIAL_DAYS` to 7 globally** |
| Currently `expired` (Paywall) | Become `free` with first-3 visibility on next access check |
| Currently `paid` / `lifetime` | Unchanged (subject to Paid alert caps: 15 × 4+4) |
| Guests with local data | Guest entry removed; prompt sign-in; local data remains in browser until they sign in (no auto-merge required in v1) |

## Testing

- Unit: first-3 selection from mixed buy/sell history; filter helpers; quota day boundaries.  
- Unit: `computeAccess` returns `free` after trial without `access_until`.  
- Unit: chart initial selection never defaults to OGDC / list[0].  
- Integration/UI: Free export 1/day first-3 only; import skips non-entitled; chart 6th view blocked; signals show 5 + paywall rows.  
- Alerts API: Free rejects 4th ticker / 3rd TP; Paid rejects 16th ticker / 5th TP.  
- Profiles: 8th unique profile open blocked on Free; positions locked outside first-3.  

## Success criteria

- No Guest Mode entry on Login.  
- Post-trial users stay in app on Free.  
- Lapsed Paid users see only first-3 tickers/funds in holdings until Paid; company profiles still allow up to 7 with locked positions.  
- Matrix quotas enforced for Free; Paid uses matrix caps (alerts 15×4+4, etc.).  
- Free export 1/day first-3 only; import filtered to entitlement.  
- Charts never auto-load a default symbol.  

## Open items resolved in this revision

- AI Free = 10/day  
- First 3 = first transaction date  
- Alerts: Free 3×2+2; Paid 15×4+4  
- Export: Free 1/day first-3 (not blocked)  
- Stock profiles: 7 lifetime; sectors uncapped; positions = first-3 only  
- Charts: empty until user picks  

## Follow-ups (out of scope)

- Auto-billing  
- Server-side gating of all market data APIs  
- Merging anonymous local portfolios into new accounts  
- Full entitlements enforcement implementation (separate plan)  
