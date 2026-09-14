# Premium Badge branding

Applied the selected emerald-and-gold Premium Badge to the shared app logo, landing header/footer, expanded and collapsed sidebar, approval/paywall screens, favicons, Apple home-screen icon, PWA icons, and notification artwork.

- Editable source: `public/brand/premium-badge.svg`; recreated as vector paths from the approved concept rather than embedding the presentation sheet.
- Badge colors: emerald `#059669`, gold `#C4A03D`; dark UI uses the white badge treatment. Wordmark: PSX in emerald, Tracker in the user's reference cyan-blue `#06B6D4`. Tagline: KNOW MORE. in cyan-blue, EARN MORE. in emerald. Dark UI uses lighter emerald `#34d399` and the same reference cyan-blue.
- Wordmark: **PSX Tracker**. Tagline: **KNOW MORE. EARN MORE.**
- Phone header uses the compact horizontal logo; the tagline remains on the full logo and footer. The 320px header check confirmed the badge and Get Started button fit without overlap or page overflow.
- Theme-aware SVG favicon, ICO with 16/32/48px images, PNG favicon, 180px Apple icon, 64/192/512px PWA icons, 512px maskable icon with safe padding, and transparent monochrome notification badge.
- Updated manifest and precache references to the new assets. Removed icons incorrectly listed as application screenshots in the install manifest.

Validation: production build passed; 197 tests passed; the 67 existing TypeScript diagnostics remain unchanged. Browser inspection verified the light/dark logo variants and small icons, with all images loading. Physical iOS/Android install icon cache refresh is not verified.

Rebuild icons using `node scripts/generate-brand-assets.mjs` with `sharp` available. An optional `BRAND_ASSET_NODE_MODULES` environment variable can point to the bundled dependency directory without adding a project dependency. The script generates all variants from the SVG master.

Local component preview: `/tests/branding/index.html` while Vite is running. Changes are local; deployment is not included.
