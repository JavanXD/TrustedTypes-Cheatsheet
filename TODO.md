# Trusted Types Cheatsheet — TODO

## Current / next

- **Now:** Hygiene follow-ups from 2026-08-30 live verify (exclude internal TODO from public site; PNG favicon; strip unused CORS at edge).
- **Ops:** GitHub Pages via `.github/workflows/pages.yml` on `main`. Edge security headers today via Worker `javan-gh-pages-headers`. **Blocked 2026-09-01:** general API token has no Zone Transform Rules write (403). Stay on the Worker until a token can write Transform / `_headers` after leaving GH Pages. Tracked: `~/Projects/*.javan.de/javan.de/TODO.md`.

## Web hygiene / security (2026-08-29 audit + 2026-08-30)

- [x] Favicon: `/favicon.ico` + HTML `<link rel="icon">` *(build copies `assets/favicon.ico` into `site/`)*
- [x] `og:image` / `twitter:image` PNG 1200×630 (`assets/og-image.png`)
- [x] Referrer-Policy + X-Frame-Options + nosniff + Permissions-Policy *(edge Worker on `tt-cheatsheet.javan.de/*`)*
- [x] Meta `referrer` on generated pages
- [x] Do not publish `TODO.md` (or other SKIP_MD files) as public HTML / sitemap / llms.txt entries
- [x] PNG favicon: `/favicon-192.png` (stop using 1200×630 OG image as `rel="icon"`)
- [x] Drop GitHub Pages `Access-Control-Allow-Origin: *` via edge Worker *(shared `javan-gh-pages-headers`)*
- [x] Optional: Content-Security-Policy (careful — site loads highlight.js / mermaid from CDN) *(enforcing via `javan-gh-pages-headers`; cdnjs + jsdelivr + unsafe-inline for mermaid module + TOC — 2026-08-30)*
- [ ] Optional: dedicated apple-touch-icon (192 PNG already covers most browsers)

## Needs your decision

- [x] **`javan-gh-pages-headers` → `_headers` / Transform (quota-free).** Decided 2026-09-01: do not keep a header-only Worker on the shared Javan 100k pool. Implement: P1 in `~/Projects/*.javan.de/javan.de/TODO.md`.
- [ ] **Migrate headers off `javan-gh-pages-headers`.** Per-host `_headers` (or zone Transform Rule); then detach this host from the shared Worker.
