# SEO Foundation (Landing-Only) — Design

**Date:** 2026-09-07  
**Site:** https://www.psx-tracker.com/  
**Status:** Approved for planning after user review of this spec  

## Goal

Make the public homepage discoverable and shareable: correct Google snippet fields, social link previews, and crawl hints. Defer public ticker/chart indexing to a later phase.

## Context

- PSX Tracker is a React SPA (Vite) with History API routes.
- Unauthenticated visitors primarily see `LoginPage` (marketing + auth). App routes like `/stocks/OGDC` are not reliably crawlable while login gates the app.
- Current `index.html` has a generic title (`PSX Portfolio Tracker`) and no description, Open Graph, canonical, `robots.txt`, or sitemap.

## Approach

**Static foundation only** (Approach 1 from brainstorming):

1. Enrich root `index.html` meta tags for the canonical homepage.
2. Ship `public/robots.txt` and `public/sitemap.xml` (homepage only).
3. Reuse existing share image at `/preview/dashboard.png`.
4. After deploy: Google Search Console verify + submit sitemap (manual checklist for the owner).

No auth, routing, SSR, prerender, Analytics, or public stock-page work in this phase.

## Metadata content

| Field | Value |
|-------|--------|
| Canonical URL | `https://www.psx-tracker.com/` |
| Title | `PSX Tracker — Pakistan Stock Exchange Portfolio & Charts` |
| Description | Live PSX prices, FIFO portfolio tracking, mutual funds with NAV sync, and candlestick charts. 15-day free trial — no card required. |
| `og:type` | `website` |
| `og:url` | `https://www.psx-tracker.com/` |
| `og:title` / `twitter:title` | Same as title |
| `og:description` / `twitter:description` | Same as description |
| `og:image` / `twitter:image` | `https://www.psx-tracker.com/preview/dashboard.png` |
| `twitter:card` | `summary_large_image` |
| `html lang` | Keep `en` (existing) |

Also set `meta name="robots" content="index, follow"`.

## Files to change

| File | Change |
|------|--------|
| `index.html` | Add description, canonical, robots, Open Graph, Twitter Card tags; update `<title>` |
| `public/robots.txt` | **New** — `Allow: /`, `Sitemap: https://www.psx-tracker.com/sitemap.xml` |
| `public/sitemap.xml` | **New** — single URL entry for `https://www.psx-tracker.com/` with reasonable `changefreq`/`priority` |

Vite already serves `public/` at the site root; no Vite config change required.

## Out of scope

- Public crawlable stock/fund/chart pages
- SSR, SSG, or prerender plugins
- Per-route `document.title` helper (Approach 2 — later)
- Google Analytics / Tag Manager
- Blog or content marketing
- Changing login, guest, or approval flows
- Forcing www vs apex redirects in app code (assume hosting already prefers `www`)

## Verification

**After deploy:**

1. View source on `/` — title, description, OG/Twitter, canonical present.
2. `GET /robots.txt` and `GET /sitemap.xml` return the new files.
3. Share homepage in WhatsApp (or LinkedIn/Facebook debugger) — preview shows title + image.

**Search Console (owner, post-deploy):**

1. Add property `https://www.psx-tracker.com/`.
2. Verify (HTML meta tag or DNS).
3. Submit sitemap URL.
4. URL Inspection on `/` — confirm discovered/crawled (indexing may take days).

## Success criteria

- Homepage has complete SEO/share metadata on production.
- Robots + sitemap are live and submitted.
- Social share preview is usable.
- No regression to login/guest/app behavior.

## Phase 2 (not this work)

Open selected stock/chart URLs to crawlers and/or prerender HTML so queries like “OGDC chart” can rank — only after this foundation is live.
