# Advanced SEO (Technical + Guides) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase A technical SEO (JSON-LD, sitemap, Search Console meta hook, OG check) and Phase B static `/guides` hub plus seven educational pages.

**Architecture:** Extend the existing Vite `publicPagesPlugin` + `lib/publicSite.js` pattern. Guide copy lives in `config/guidePages.js`. Homepage JSON-LD is generated from `config/site.js` (`HOME_FAQS`, `SITE_URL`) and injected into both `index.html` files. Sitemap lists all public URLs including guides.

**Tech Stack:** Vite, static HTML public pages, Vitest, Vercel `cleanUrls`

**Spec:** `docs/superpowers/specs/2026-09-17-advanced-seo-guides-design.md`

## Global Constraints

- No indexing of private app routes; do not remove existing `noindex` headers
- Guides are educational + product-accurate; include not-investment/tax-advice disclaimer
- Do not invent company legal details beyond `config/site.js`
- Keep `src/index.html` identical to root `index.html` for shared homepage tags
- Prefer TDD: failing test → implement → pass
- Commits only if the user asks (do not auto-commit)

## File map

| File | Role |
|------|------|
| `config/site.js` | Add `GOOGLE_SITE_VERIFICATION` (optional string), Guides to `PUBLIC_LINKS` |
| `config/guidePages.js` | Hub + 7 guides copy (title, description, intro, sections, related) |
| `lib/seoJsonLd.js` | Build Organization / SoftwareApplication / FAQPage JSON-LD objects + HTML script tag |
| `lib/publicSite.js` | Render legal pages + guide hub/detail; shared chrome |
| `scripts/public-pages-plugin.ts` | Serve/emit `about.html`… and `guides.html`, `guides/<slug>.html` |
| `public/sitemap.xml` | All public locs + lastmod |
| `index.html` / `src/index.html` | JSON-LD scripts, optional verification meta, Guides link in crawlable nav |
| `src/utils/seoFoundation.test.ts` | JSON-LD + sitemap guides + verification hook |
| `lib/publicSite.test.ts` | Guide render + canonical tests |

---

### Task 1: JSON-LD builder + homepage injection

**Files:**
- Create: `lib/seoJsonLd.js`
- Create: `lib/seoJsonLd.test.ts`
- Modify: `index.html`, `src/index.html`
- Modify: `config/site.js` (optional `GOOGLE_SITE_VERIFICATION = ''`)
- Modify: `src/utils/seoFoundation.test.ts`

**Interfaces:**
- Produces: `buildHomeJsonLd()`, `homeJsonLdScriptTags()`, maybe `verificationMetaTag()`

- [ ] **Step 1:** Write failing tests in `lib/seoJsonLd.test.ts` asserting FAQ questions match `HOME_FAQS` and Organization url is `SITE_URL`
- [ ] **Step 2:** Implement `lib/seoJsonLd.js`
- [ ] **Step 3:** Inject script tags into both index.html files after description meta; if `GOOGLE_SITE_VERIFICATION` non-empty, document that build or a tiny vite transform injects it — simplest: export constant and have `seoFoundation.test.ts` skip when empty; add placeholder comment in HTML only when we use vite `transformIndexHtml` to inject from `config/site.js`
- [ ] **Step 4:** Prefer Vite `transformIndexHtml` in existing product-terms plugin (or tiny sibling) to inject JSON-LD + verification meta so both HTML sources stay in sync via transform — OR paste identical static JSON-LD into both files and keep FAQ in sync via test that parses HTML. **Chosen:** generate script content in `lib/seoJsonLd.js` and inject via `transformIndexHtml` reading from that module; keep a `%SEO_JSON_LD%` placeholder in both index files.
- [ ] **Step 5:** Run `npm test -- lib/seoJsonLd.test.ts src/utils/seoFoundation.test.ts` — expect PASS

---

### Task 2: Enriched sitemap

**Files:**
- Modify: `public/sitemap.xml`
- Modify: `src/utils/seoFoundation.test.ts`, `lib/publicSite.test.ts`

- [ ] **Step 1:** Failing test: sitemap must contain `/guides` and each of the seven guide locs
- [ ] **Step 2:** Update `sitemap.xml` with homepage, legal, guides hub, seven guides, `lastmod` 2026-09-17
- [ ] **Step 3:** Tests PASS

---

### Task 3: Guide config + renderer

**Files:**
- Create: `config/guidePages.js`
- Modify: `lib/publicSite.js` — `renderGuideHub()`, `renderGuidePage(slug)`, or unify `renderPublicPage` to accept guide keys
- Modify: `scripts/public-pages-plugin.ts` — route `guides` and `guides/:slug`
- Modify: `lib/publicSite.test.ts`

**Guide slugs (exact):**
1. `fifo-cost-basis-psx`
2. `cgt-basics-pakistan-stocks`
3. `mutual-fund-nav-tracking`
4. `google-drive-backup-restore`
5. `psx-charts-in-app`
6. `free-vs-paid-trial`
7. `importing-broker-trades`

- [ ] **Step 1:** Failing tests for each guide canonical `https://www.psx-tracker.com/guides/<slug>` and hub `/guides`
- [ ] **Step 2:** Implement `config/guidePages.js` with full copy (3–6 sections each) + disclaimer
- [ ] **Step 3:** Extend renderer + plugin for nested paths (`guides.html`, `guides/<slug>.html`)
- [ ] **Step 4:** Tests PASS

---

### Task 4: Discovery links

**Files:**
- Modify: `config/site.js` — `PUBLIC_LINKS` include `['Guides', '/guides']`
- Modify: `index.html` / `src/index.html` crawlable `<nav>` — add Guides
- Modify: `lib/publicSite.js` footer already uses `PUBLIC_LINKS`

- [ ] **Step 1:** Test or assert footer/render includes `/guides`
- [ ] **Step 2:** Wire links
- [ ] **Step 3:** PASS

---

### Task 5: Verification

- [ ] **Step 1:** `npm test` — all SEO/publicSite/guide tests green; note any pre-existing SEO trial-day failures and fix index sync if caused by this work
- [ ] **Step 2:** Confirm `public/preview/dashboard.png` exists
- [ ] **Step 3:** Summarize owner Search Console checklist

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| JSON-LD Org + SoftwareApplication + FAQPage | 1 |
| Sitemap enrichment | 2 |
| Search Console meta hook | 1 |
| OG asset exists | 5 |
| `/guides` + 7 pages | 3 |
| Footer/home links | 4 |
| Private noindex unchanged | (no change) |
| Tests | 1–5 |
