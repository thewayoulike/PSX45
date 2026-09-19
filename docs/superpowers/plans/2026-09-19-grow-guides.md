# Grow Guides (5 New Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five evergreen educational guides to the existing static `/guides` system so Search Console and the hub expose more investor-intent URLs.

**Architecture:** Extend `config/guidePages.js` with five new GuidePage entries (same shape as existing). Update `public/sitemap.xml` locs + `lastmod`. Hub and renderer already iterate `guidePages` — no new routes. Cross-link `related` arrays between old and new guides where natural.

**Tech Stack:** Existing Vite public-pages plugin, `lib/publicSite.js`, Vitest (`npm test`).

**Spec:** Approved chat design 2026-09-19 (Approach A — Grow guides); builds on `docs/superpowers/specs/2026-09-17-advanced-seo-guides-design.md`.

## Global Constraints

- Educational copy only; include the shared disclaimer (not investment/tax/legal advice).
- English, clear investor language; no fabricated FBR rates or guaranteed returns.
- Static HTML via existing guide renderer; no CMS, no SPA-only pages.
- Sitemap must list every `Object.keys(guidePages)` slug (tests already enforce this).

---

### Task 1: Five new guide pages + sitemap

**Files:**
- Modify: `config/guidePages.js`
- Modify: `public/sitemap.xml`
- Test: `src/utils/seoFoundation.test.ts` (already loops all guidePages)
- Test: `lib/publicSite.test.ts` (already renders each guide)

**Interfaces:**
- Consumes: existing `GuidePage` typedef and `disclaimer` in `guidePages.js`
- Produces: slugs `tracking-psx-dividends`, `multi-portfolio-stocks-vs-funds`, `watchlists-and-alerts`, `psx-portfolio-export-reconcile`, `understanding-unrealized-vs-realized`

- [x] **Step 1:** Confirm sitemap test fails for missing new locs only after guide entries exist without sitemap rows — add guides first, run `npx vitest run src/utils/seoFoundation.test.ts lib/publicSite.test.ts`, expect sitemap failure if locs omitted.

- [x] **Step 2:** Add five guide objects with title, blurb, description, intro, 4–6 sections, related links.

- [x] **Step 3:** Append five `<url>` entries to `public/sitemap.xml` with `lastmod` 2026-09-19; bump guides hub `lastmod` to 2026-09-19.

- [x] **Step 4:** Wire `related` on a few existing guides to point at relevant new slugs (dividends ↔ FIFO/CGT; unrealized ↔ FIFO; export ↔ importing; multi-portfolio ↔ mutual-fund; watchlists ↔ charts/alerts).

- [x] **Step 5:** Update `guideHub.description` to mention the broader topic set.

- [x] **Step 6:** Run `npx vitest run src/utils/seoFoundation.test.ts lib/publicSite.test.ts` — all green.

- [ ] **Step 7:** Commit only if user requests (do not commit unprompted).

---

## Manual after deploy

1. Confirm `/guides` lists 12 cards and one new guide URL returns static HTML.
2. Search Console will discover new locs on next sitemap read (optional re-submit).
