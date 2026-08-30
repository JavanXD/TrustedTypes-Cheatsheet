# Trusted Types Cheatsheet — TODO

## Current / next

- **Now:** Hygiene follow-ups from 2026-08-30 live verify (exclude internal TODO from public site; PNG favicon; strip unused CORS at edge).
- **Ops:** GitHub Pages via `.github/workflows/pages.yml` on `main`. Edge security headers via Cloudflare Worker `javan-gh-pages-headers` (source: `~/Projects/www.javan.de/workers/javan-gh-pages-headers`).

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

- [ ] Keep edge Worker `javan-gh-pages-headers` as the long-term header source for this GH Pages host, or migrate the site to Cloudflare Pages/`_headers`?
