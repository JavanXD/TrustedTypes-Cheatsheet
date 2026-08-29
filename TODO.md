# Trusted Types Cheatsheet — TODO

## Current / next

- **Now:** Web hygiene pass from 2026-08-29 external audit (favicon, OG PNG, edge headers).
- **Ops:** GitHub Pages via `.github/workflows/pages.yml` on `main`. Edge security headers via Cloudflare Worker `javan-gh-pages-headers` (source: `~/Projects/www.javan.de/workers/javan-gh-pages-headers`).

## Web hygiene / security (2026-08-29 audit)

- [x] Favicon: `/favicon.ico` + HTML `<link rel="icon">` *(build copies `assets/favicon.ico` into `site/`)*
- [x] `og:image` / `twitter:image` PNG 1200×630 (`assets/og-image.png`)
- [x] Referrer-Policy + X-Frame-Options + nosniff + Permissions-Policy *(edge Worker on `tt-cheatsheet.javan.de/*`)*
- [x] Meta `referrer` on generated pages
- [ ] Optional: drop GitHub Pages `Access-Control-Allow-Origin: *` via Worker (low risk for static docs)
- [ ] Optional: Content-Security-Policy (careful — site loads highlight.js / mermaid from CDN)

## Needs your decision

- [ ] Keep edge Worker `javan-gh-pages-headers` as the long-term header source for this GH Pages host, or migrate the site to Cloudflare Pages/`_headers`?
