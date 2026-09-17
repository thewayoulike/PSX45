# Advanced SEO — Technical Pack + Guides (Design)

**Date:** 2026-09-17  
**Site:** https://www.psx-tracker.com/  
**Status:** Draft for user review (approved in chat: Phase A + Phase B, static guides, ~7 articles)

## Goal

Help new visitors find PSX Tracker in Google and understand the product before signing up — without indexing private portfolio/app routes.

1. **Phase A — Technical SEO:** richer machine-readable signals (JSON-LD, sitemap), Search Console hook, solid share preview.
2. **Phase B — Content SEO:** a crawlable `/guides` hub plus **seven** static educational pages that rank for investor intent and link into signup.

Public ticker/fund pages remain **out of scope** (future Phase C).

## Context

- Landing SEO foundation already ships: homepage meta/OG, `robots.txt`, `sitemap.xml`, About/Privacy/Terms/Contact via `lib/publicSite.js` + `config/publicPages.js`.
- Private routes stay `noindex` (Vercel headers + client).
- Guides must be **static HTML** (same public-site renderer), not SPA-only views, so Google gets real HTML without executing the React app.

## Approach

**Extend the existing public HTML system** (not a new blog framework, not Medium).

| Piece | Choice |
|-------|--------|
| Hosting | Build-time / Vite public pages (same as About) |
| URLs | `/guides`, `/guides/<slug>` |
| Count | 7 guides in the first batch |
| Indexing | `index, follow` for guides; app routes stay `noindex` |
| Auth | None required to read guides |

## Phase A — Technical SEO

### A1. JSON-LD on homepage

Inject one or more `<script type="application/ld+json">` blocks into the crawlable homepage shell (`index.html` / generated home content — whichever currently holds the public H1/FAQ), using existing site constants:

- **Organization** — name, url, logo  
- **SoftwareApplication** (or WebApplication) — name, description, url, applicationCategory, offers summary pointing at Free/Paid as already described on the landing  
- **FAQPage** — mirror `HOME_FAQS` from `config/site.js` (same questions/answers as visible FAQ)

Do not invent company registration details. Use only published brand and support facts from `config/site.js`.

### A2. Sitemap enrichment

Update `public/sitemap.xml` (or generate it from config at build time if cleaner) to include:

- `/` (priority 1.0)  
- `/about`, `/privacy`, `/terms`, `/contact`  
- `/guides`  
- each `/guides/<slug>`  

Add `<lastmod>` (ISO date) where practical. Omit `/login` and all signed-in app paths.

### A3. Search Console verification

Support an optional `google-site-verification` meta tag driven by env/config (e.g. `GOOGLE_SITE_VERIFICATION` or a field in `config/site.js`). If empty, omit the tag. Owner still verifies and submits the sitemap in Search Console manually after deploy.

### A4. Open Graph asset

Ensure `public/preview/dashboard.png` exists and is served at `https://www.psx-tracker.com/preview/dashboard.png`. Keep existing OG/Twitter tags pointing at it. No new image art required unless the file is missing.

### A5. Unchanged

- Private app `noindex` headers and client behavior  
- Apex→www hosting redirect (already documented as hosting-level)  
- No analytics/RUM requirement in this phase  

## Phase B — Guides content

### B1. Information architecture

| URL | Purpose |
|-----|---------|
| `/guides` | Hub: short intro + cards/links to all 7 guides + CTA to start free / log in |
| `/guides/fifo-cost-basis-psx` | FIFO cost basis on PSX |
| `/guides/cgt-basics-pakistan-stocks` | Capital gains tax basics for Pakistani stocks |
| `/guides/mutual-fund-nav-tracking` | Mutual fund NAV & daily P&L |
| `/guides/google-drive-backup-restore` | Google Drive backup & restore |
| `/guides/psx-charts-in-app` | Using PSX charts in the app |
| `/guides/free-vs-paid-trial` | Free vs Paid and the trial |
| `/guides/importing-broker-trades` | Importing broker trades |

Slugs may be adjusted slightly for clarity; titles must stay intent-focused and honest (educational, not “guaranteed returns”).

### B2. Page shape

Reuse the public page chrome (header brand, Log in, footer legal links). Each guide page includes:

- Unique `<title>`, meta description, canonical, OG basics  
- Eyebrow + H1 + short intro  
- 3–6 H2 sections of practical explanation (accurate to how PSX Tracker works; disclaimer that this is not tax/investment advice)  
- Clear CTA: Start free / Log in  
- Links: back to `/guides`, related guide(s), Contact if needed  

Hub `/guides` lists all guides with one-line blurbs.

### B3. Copy source of truth

Store guide copy in config (e.g. extend `config/publicPages.js` or add `config/guidePages.js`) consumed by `lib/publicSite.js` (or a thin sibling renderer) so build and tests share one source. Prefer English, clear investor language, no fabricated legal claims.

### B4. Discovery wiring

- Footer / homepage marketing: add **Guides** link alongside About/Privacy  
- Sitemap includes hub + all guides  
- Internal links between related guides  

## Testing

- Extend `seoFoundation` / `publicSite` tests: sitemap contains `/guides` and each guide loc; each guide HTML has unique title, description, canonical, H1  
- Homepage JSON-LD parses as JSON and includes FAQ question strings that match `HOME_FAQS`  
- `src/index.html` remains identical to root `index.html` if both carry shared homepage tags  
- OG image path still exists  

## Acceptance criteria

1. Deployed homepage exposes valid Organization + SoftwareApplication + FAQPage JSON-LD.  
2. Sitemap lists all public legal pages, `/guides`, and seven guide URLs; Search Console can submit it.  
3. `/guides` and each guide URL return static HTML with unique meta and a signup CTA.  
4. Private app routes remain noindex.  
5. Tests covering sitemap + guide meta pass.  

## Owner checklist (manual, after deploy)

1. Google Search Console → property for `https://www.psx-tracker.com/`  
2. Paste verification token into config/env if using meta method; redeploy  
3. Submit `https://www.psx-tracker.com/sitemap.xml`  
4. Spot-check Rich Results / URL Inspection for homepage and one guide  

## Out of scope

- Public `/stocks/TICKER` or fund SEO pages  
- Blog CMS, comments, author bios  
- Paid ads, email drip, analytics dashboards  
- Urdu localization / hreflang  
- Changing Google OAuth verification  

## Risks

- **Thin or inaccurate tax copy** — CGT/FIFO guides must stay high-level and disclaimed; prefer “how the app models X” over “your legal tax position.”  
- **Duplicate homepage content** — guides should not paste the entire landing page; each needs a distinct intent.  
- **Missing OG file** — breaks social previews and the existing foundation test.  

## Implementation order

1. Phase A (JSON-LD, sitemap, verification hook, OG check)  
2. Guide config + renderer + `/guides` hub  
3. Seven guide pages + footer/nav links  
4. Tests + deploy checklist  

After this spec is approved, create an implementation plan via the writing-plans skill (no code until that plan is executed in a follow-up).
