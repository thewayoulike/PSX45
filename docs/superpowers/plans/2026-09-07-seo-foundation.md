# SEO Foundation (Landing-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship homepage SEO/share metadata, `robots.txt`, and a one-URL `sitemap.xml` for https://www.psx-tracker.com/.

**Architecture:** Static Vite `public/` assets plus head tags in `index.html`. No SPA routing, auth, or SSR changes. A Vitest file asserts the required strings exist so regressions are caught in CI/`npm test`.

**Tech Stack:** Vite static `public/`, root `index.html` (and duplicate `src/index.html`), Vitest (`npm test`).

**Spec:** `docs/superpowers/specs/2026-09-07-seo-foundation-design.md`

## Global Constraints

- Canonical site: `https://www.psx-tracker.com/` (include trailing slash where the spec uses it).
- Title (exact): `PSX Tracker — Pakistan Stock Exchange Portfolio & Charts`
- Description (exact): `Live PSX prices, FIFO portfolio tracking, mutual funds with NAV sync, and candlestick charts. 15-day free trial — no card required.`
- OG image (exact): `https://www.psx-tracker.com/preview/dashboard.png`
- Do **not** change login/guest/auth, app routes, SSR, or Analytics.
- `index.html` and `src/index.html` are currently identical — keep them identical after edits.
- Tests: `npm test` (Vitest). TDD: failing test → implement → pass.
- **Do not `git commit` unless the user explicitly asks** (user rule overrides plan commit steps).

## File map

| File | Role |
|------|------|
| `src/utils/seoFoundation.test.ts` | Asserts required strings in HTML + robots + sitemap |
| `public/robots.txt` | Allow crawl; point to sitemap |
| `public/sitemap.xml` | Single homepage URL |
| `index.html` | Title + meta + OG/Twitter + canonical (Vite entry) |
| `src/index.html` | Same head content as root (keep in sync) |

---

### Task 1: Failing SEO foundation tests

**Files:**
- Create: `src/utils/seoFoundation.test.ts`

**Interfaces:**
- Consumes: none (reads files from repo root via `fs` + `path`)
- Produces: test expectations that Tasks 2–3 must satisfy

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/seoFoundation.test.ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const TITLE = 'PSX Tracker — Pakistan Stock Exchange Portfolio & Charts';
const DESCRIPTION =
  'Live PSX prices, FIFO portfolio tracking, mutual funds with NAV sync, and candlestick charts. 15-day free trial — no card required.';
const CANONICAL = 'https://www.psx-tracker.com/';
const OG_IMAGE = 'https://www.psx-tracker.com/preview/dashboard.png';

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('SEO foundation', () => {
  it('ships robots.txt that allows crawl and points at sitemap', () => {
    const robots = read('public/robots.txt');
    expect(robots).toMatch(/User-agent:\s*\*/i);
    expect(robots).toMatch(/Allow:\s*\//i);
    expect(robots).toContain('Sitemap: https://www.psx-tracker.com/sitemap.xml');
  });

  it('ships sitemap.xml with the canonical homepage', () => {
    const sitemap = read('public/sitemap.xml');
    expect(sitemap).toContain('<urlset');
    expect(sitemap).toContain(`<loc>${CANONICAL}</loc>`);
  });

  it('index.html has title, description, canonical, robots, and social tags', () => {
    const html = read('index.html');
    expect(html).toContain(`<title>${TITLE}</title>`);
    expect(html).toContain(`content="${DESCRIPTION}"`);
    expect(html).toContain(`rel="canonical" href="${CANONICAL}"`);
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).toContain(`property="og:url" content="${CANONICAL}"`);
    expect(html).toContain(`property="og:title" content="${TITLE}"`);
    expect(html).toContain(`property="og:description" content="${DESCRIPTION}"`);
    expect(html).toContain(`property="og:image" content="${OG_IMAGE}"`);
    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain(`name="twitter:title" content="${TITLE}"`);
    expect(html).toContain(`name="twitter:description" content="${DESCRIPTION}"`);
    expect(html).toContain(`name="twitter:image" content="${OG_IMAGE}"`);
  });

  it('keeps src/index.html identical to root index.html', () => {
    expect(existsSync(join(root, 'src/index.html'))).toBe(true);
    expect(read('src/index.html')).toBe(read('index.html'));
  });

  it('OG preview image file exists in public/', () => {
    expect(existsSync(join(root, 'public/preview/dashboard.png'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/utils/seoFoundation.test.ts`

Expected: FAIL (missing `public/robots.txt` and/or missing meta strings in `index.html`)

- [ ] **Step 3: Stop** — do not implement yet; Task 2 adds crawl files, Task 3 updates HTML.

---

### Task 2: `robots.txt` + `sitemap.xml`

**Files:**
- Create: `public/robots.txt`
- Create: `public/sitemap.xml`

**Interfaces:**
- Consumes: expectations from Task 1 robots/sitemap tests
- Produces: static files served at `/robots.txt` and `/sitemap.xml` after Vite build

- [ ] **Step 1: Create `public/robots.txt`**

Exact contents:

```txt
User-agent: *
Allow: /

Sitemap: https://www.psx-tracker.com/sitemap.xml
```

- [ ] **Step 2: Create `public/sitemap.xml`**

Exact contents:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.psx-tracker.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

- [ ] **Step 3: Re-run SEO tests**

Run: `npm test -- --run src/utils/seoFoundation.test.ts`

Expected: robots + sitemap + OG image tests PASS; `index.html` meta test still FAIL; identical-html test may still PASS or FAIL depending on current sync (both still old).

---

### Task 3: Homepage meta tags in both `index.html` files

**Files:**
- Modify: `index.html` (head section near existing `<title>`)
- Modify: `src/index.html` (same edits — file must remain byte-identical to root)

**Interfaces:**
- Consumes: exact title/description/canonical/OG strings from Global Constraints
- Produces: crawlable/shareable homepage head for production build

- [ ] **Step 1: Update root `index.html` `<head>`**

Replace the existing `<title>PSX Portfolio Tracker</title>` block with (keep charset/viewport/theme-color/PWA/apple tags and scripts already present):

```html
    <title>PSX Tracker — Pakistan Stock Exchange Portfolio & Charts</title>
    <meta name="description" content="Live PSX prices, FIFO portfolio tracking, mutual funds with NAV sync, and candlestick charts. 15-day free trial — no card required." />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://www.psx-tracker.com/" />

    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://www.psx-tracker.com/" />
    <meta property="og:title" content="PSX Tracker — Pakistan Stock Exchange Portfolio & Charts" />
    <meta property="og:description" content="Live PSX prices, FIFO portfolio tracking, mutual funds with NAV sync, and candlestick charts. 15-day free trial — no card required." />
    <meta property="og:image" content="https://www.psx-tracker.com/preview/dashboard.png" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="PSX Tracker — Pakistan Stock Exchange Portfolio & Charts" />
    <meta name="twitter:description" content="Live PSX prices, FIFO portfolio tracking, mutual funds with NAV sync, and candlestick charts. 15-day free trial — no card required." />
    <meta name="twitter:image" content="https://www.psx-tracker.com/preview/dashboard.png" />
```

Place these after the existing theme-color / apple-mobile meta tags and **before** `<link rel="apple-touch-icon" ...>`.

- [ ] **Step 2: Copy root `index.html` over `src/index.html`**

On Windows PowerShell from repo root:

```powershell
Copy-Item -Path index.html -Destination src/index.html -Force
```

- [ ] **Step 3: Run SEO tests — expect all PASS**

Run: `npm test -- --run src/utils/seoFoundation.test.ts`

Expected: all 5 tests PASS

- [ ] **Step 4: Run full suite**

Run: `npm test -- --run`

Expected: all existing tests still PASS

- [ ] **Step 5: Local smoke (optional but recommended)**

Run: `npm run build` then confirm `dist/index.html` contains the new title, and `dist/robots.txt` / `dist/sitemap.xml` exist.

---

### Task 4: Owner checklist after deploy (no code)

**Files:** none (documentation for the human owner)

**Interfaces:** none

- [ ] **Step 1: After merge/deploy to production, verify in browser**

1. Open https://www.psx-tracker.com/ → View Page Source → confirm title, description, OG tags, canonical.
2. Open https://www.psx-tracker.com/robots.txt
3. Open https://www.psx-tracker.com/sitemap.xml
4. Share the homepage URL in WhatsApp (or use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)) and confirm preview image + title.

- [ ] **Step 2: Google Search Console (one-time)**

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property: URL prefix `https://www.psx-tracker.com/`
3. Verify ownership (HTML tag method: Search Console gives a `meta name="google-site-verification"` — add that one line to `index.html` / `src/index.html` in a follow-up if needed, then re-deploy; DNS verification also works if you control the domain DNS)
4. Sitemaps → submit `https://www.psx-tracker.com/sitemap.xml`
5. URL Inspection → inspect `https://www.psx-tracker.com/` → Request indexing

Note: Ranking improvements can take days; this phase only ensures crawl/share readiness.

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Title / description / canonical / robots meta | Task 3 |
| Open Graph + Twitter tags | Task 3 |
| OG image path `/preview/dashboard.png` | Task 1 assert + Task 3 tags |
| `public/robots.txt` | Task 2 |
| `public/sitemap.xml` homepage only | Task 2 |
| Keep login/guest unchanged | Global Constraints (no app code tasks) |
| Search Console + post-deploy verify | Task 4 |
| Out of scope (SSR, public tickers, Analytics) | Not in plan |

## Execution handoff

After this plan is saved, implement Task 1 → 2 → 3 in order (TDD). Task 4 is owner-facing after production deploy.
