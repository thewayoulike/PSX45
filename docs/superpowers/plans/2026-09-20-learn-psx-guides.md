# Learn-PSX Guides Batch (11 Original Topics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eleven original educational guides covering the same *topics* as a public PSX learn hub, without copying wording or fee tables; ship via the existing static guides system.

**Architecture:** Extend `config/guidePages.js` with eleven `GuidePage` entries. Update `public/sitemap.xml` and cross-link `related`. Hub/renderer already iterate `guidePages`.

**Tech Stack:** Existing Vite public pages, `lib/publicSite.js`, Vitest.

**Spec:** Approved chat design 2026-09-20 (Approach C — rewrite topics, not paste).

## Global Constraints

- Original English copy only; educational + shared disclaimer; not tax/Shariah/investment advice.
- No scraped broker fee tables or invented FBR/Shariah figures — tell readers to verify current sources.
- Sitemap must include every `guidePages` slug (existing tests).

---

### Task 1: Eleven guides + sitemap

**Files:**
- Modify: `config/guidePages.js`
- Modify: `public/sitemap.xml`
- Test: `src/utils/seoFoundation.test.ts`, `lib/publicSite.test.ts`

**Produces slugs:**
`stock-factors-investors-watch`, `start-investing-on-psx`, `realistic-psx-returns`, `is-psx-investing-halal`, `psx-with-limited-capital`, `choosing-a-psx-broker`, `pe-ratio-for-psx-stocks`, `kmi-and-shariah-screening`, `graham-style-margin-of-safety`, `analyze-cement-stocks-psx`, `analyze-pakistani-banks-psx`

- [x] **Step 1:** Add eleven guide objects (title, blurb, description, intro, 4–6 sections, related).
- [x] **Step 2:** Append sitemap locs with `lastmod` 2026-09-20; bump `/guides` lastmod.
- [x] **Step 3:** Update `guideHub.description`; cross-link a few existing guides.
- [x] **Step 4:** Run `npx vitest run src/utils/seoFoundation.test.ts lib/publicSite.test.ts`.
- [ ] **Step 5:** Commit only if user requests.
