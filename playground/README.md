# Trusted Types — Playground

Local **DOM XSS** vs **Trusted Types** demos that match the main cheatsheet (**`README.md`** sections **A.2**, **A.3**, **B**, **D.1**, **E.1**, **E.3**, **G**). The default **split view** is the **A.3** flow (**Perfect Types** and **`Element.setHTML()`**). The **A.2** named-policy lab is **`policy-lab.html`**. Panel headings in the iframe demos use the same letter–number labels as the cheatsheet (for example **E.1** for **`setHTML()`**, **E.3** for policy + **`innerHTML`**, **D.1** for plain **`innerHTML`**, **TrustedScript** for **`eval`**).

GitHub Pages (and the static cheatsheet site) **do not ship** these **`.html`** files. You need **`serve.mjs`**, which sets real **`Content-Security-Policy`** response headers — run from a **local clone** or open files via **GitHub** in the browser.

## Get the files

Clone or download the repo so the full **`playground/`** directory exists on disk.

- **[TrustedTypes-Cheatsheet on GitHub](https://github.com/JavanXD/TrustedTypes-Cheatsheet)** — clone, or **Code → Download ZIP**
- **[`playground/` on `main`](https://github.com/JavanXD/TrustedTypes-Cheatsheet/tree/main/playground)** — browse HTML, CSS, **`serve.mjs`**
- **[ZIP of `main`](https://github.com/JavanXD/TrustedTypes-Cheatsheet/archive/refs/heads/main.zip)** — unpack, then `cd` into **`TrustedTypes-Cheatsheet-main/playground`** (name may end in `-main`)

## Run (HTTP only — not `file://`)

```bash
node playground/serve.mjs
```

Open **http://127.0.0.1:5190/**. For **`frames/enforced-sanitizer.html`** and **`setHTML()`**, use a current Chromium- or Firefox-based browser. **As of 2026-04-22**, MDN marks the **HTML Sanitizer API** as **Limited availability**: Safari is the remaining major-browser gap, so this API is not Baseline yet (see [MDN — HTML Sanitizer API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API#browser_compatibility)).

## Screenshot

**`index.html`** after starting the server — split view: enforced sanitizer (`frames/enforced-sanitizer.html`) vs no CSP (`frames/vulnerable.html`):

![Trusted Types playground index — header, DevTools hint, and two iframe columns](../docs/playground-index.png)

### Console and CSP reporting

Open **Developer Tools → Console** (**F12**, or **Ctrl+Shift+I** / **Cmd+Option+I**). On-page **`log()`** output is mirrored to the console with a **`[…]`** filename prefix.

**Enforced frames** (`frames/enforced.html`, `frames/enforced-sanitizer.html`): expected sink **`TypeError`**s are logged with **`console.debug`** (in Chromium, set the console to **Verbose** to see them next to reporting lines from the cheatsheet **G** section).

**`violation-observe.js`** runs only on those enforced pages (the only documents that get a TT **`Content-Security-Policy`** from **`serve.mjs`**). On first **`log()`**, it wires **`ReportingObserver`** and **`securitypolicyviolation`**. **`frames/vulnerable.html`** has no CSP from the server, so it uses a plain **`log()`** only — nothing to report for **`require-trusted-types-for`**. The on-page log is for policy hooks and reporting; **`setPlaygroundSinkContext(...)`** can add **`sink: …`** when the browser emits a violation. Event details (**`sourceFile`**, **`line`**, **`document`**, **`event.target`**) vary by browser.

### Which document is enforced?

Trusted Types apply **per document** (browsing context).

- **`serve.mjs`** sends a real **`Content-Security-Policy`** header (not `<meta http-equiv>`) only for **`frames/enforced.html`** and **`frames/enforced-sanitizer.html`**. In **Network**, open the document response → **Headers** and compare to **`CSP_STRICT`** / **`CSP_PERFECT_TYPES`** in **`serve.mjs`**.
- **`frames/vulnerable.html`**, **`index.html`**, and **`policy-lab.html`** are intentionally served **without** that header so the unsafe side stays unsafe.
- The split view uses **two iframes**; TT in one iframe does not affect the other.

## Files

| Path | Role |
|------|------|
| **`index.html`** | Split view: **`frames/enforced-sanitizer.html`** vs **`frames/vulnerable.html`** |
| **`policy-lab.html`** | Links **A.2** vs **A.3** demos |
| **`frames/enforced-sanitizer.html`** | **A.3** Perfect Types (`trusted-types 'none'`): safe insert via **`setHTML()`**; **`innerHTML`** / **`eval`** blocked; **`createPolicy`** fails by design |
| **`frames/enforced.html`** | **A.2** CSP + **`myPolicy`**: **`setHTML()`** allowed; **`createHTML`** / **`createScript`** reject legacy string sinks (lab returns **`null`**) |
| **`frames/vulnerable.html`** | No TT CSP — demo payloads run after **Run** (**`alert`**) |
| **`violation-observe.js`** | Reporting helpers (**cheatsheet G**); only loaded by enforced **`frames/*.html`** |
| **`serve.mjs`** | Local static server; CSP headers on enforced HTML only; **`.css`** as **`text/css`** |
| **`index.css`**, **`policy-lab.css`**, **`frames/*.css`** | Styles for the pages above |

**CSP note:** `script-src 'unsafe-inline'` is for local demos only; `style-src 'self' 'unsafe-inline'` loads **`.css`** under `default-src 'none'`. **Do not** copy this CSP to production as-is.

**Warning:** **`frames/vulnerable.html`** is intentionally XSS-capable. Do not serve this folder on the public internet.
