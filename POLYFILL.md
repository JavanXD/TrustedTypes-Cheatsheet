# Trusted Types polyfill

How to use the **official W3C Trusted Types polyfill** when you must support browsers **without** native `trustedTypes`, and how that differs from **native CSP enforcement**.

## How this document is organized

| Section | What you will find |
|---------|-------------------|
| [Native vs polyfill](#poly-native) | What the browser does natively vs **`api_only`**, **`full`**, and **tinyfill** |
| [Which browsers need the polyfill?](#poly-browsers) | When you can omit the script vs when you still need a shim |
| [Polyfill variants](#poly-variants) | **`api_only`**, **`full`**, **tinyfill** — trade-offs and intent |
| [Load in the browser (ES5 builds)](#poly-es5) | CDN `<script>` tags for **api_only** and **full** |
| [Node.js / bundlers (npm)](#poly-node) | `npm install`, CommonJS / ESM notes |
| [Pairing with application code](#poly-pair) | Feature-detect pattern, DOMPurify + trusted output |
| [Building from source (optional)](#poly-build) | Clone upstream repo, `npm run build` |
| [Demo and tests](#poly-demo) | Hosted demo and platform-test paths |
| [When you can skip the polyfill](#poly-skip) | Matrix-only-native support |
| [Related in this repo](#poly-related) | Pointer to **`README.md`** |
| [Links & Resources](#poly-links) | MDN, GitHub, npm, web.dev, CDN URLs |

---

<a id="poly-native"></a>

## Native vs polyfill (what changes)

| Capability | Native (supporting browser + CSP) | Polyfill |
|------------|-----------------------------------|----------|
| `trustedTypes.createPolicy()` | Yes | **api_only** / **full** / **tinyfill** |
| `TrustedHTML` etc. as real objects | Yes | **api_only** / **full** (not tinyfill—see below) |
| **CSP Trusted Types enforcement** in the engine | Yes | **full** polyfill only *approximates* enforcement using a CSP string it infers (see upstream [`src/polyfill/full.js`](https://github.com/w3c/trusted-types/blob/main/src/polyfill/full.js)). **api_only** does **not** stop `innerHTML = string`. |
| **tinyfill** | N/A | Only stubs `createPolicy`; policies return **strings**; legacy sinks still accept strings—**no** enforcement. |

**Practical takeaway:** Develop and test with **real** `Content-Security-Policy: require-trusted-types-for 'script'` on a **current** browser. Use the polyfill so **older** browsers do not throw on `trustedTypes` and still run your **sanitizer inside `createHTML`**. Do not assume the polyfill fully replaces the browser’s enforcement model.

---

<a id="poly-browsers"></a>

## Which browsers need the polyfill?

Trusted Types is **part of the interoperable web platform** in **current** Chromium-, Firefox-, and Safari-based browsers (MDN documents the API under **Baseline** as broadly available in 2026—exact first versions change; use [MDN browser compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API#browser_compatibility) or [Can I use — Trusted Types](https://caniuse.com/trusted-types) for today’s matrix). For those engines, **`trustedTypes` + CSP enforcement are native**: you ship headers and policies; you **do not** need the polyfill for the API to exist or for the browser to enforce Trusted Types.

**The polyfill is for the long tail, not for “every page everywhere”:**

| Situation | Typical approach |
|-----------|------------------|
| You only support **current evergreen** (or stricter) and they all implement TT | **Omit** the polyfill; rely on native API + CSP. |
| You still support **older** Chrome / Edge / Firefox / Safari **without** `trustedTypes` | Load **`api_only`** or **`tinyfill`** so `createPolicy` exists and your sanitizers run; native enforcement does not apply there. |
| **Embedded WebViews**, **enterprise locked** builds, or **ESR** channels that lag stable | Same as row above until those versions leave your matrix. |
| You want DOM-style enforcement in a **very old** environment without native TT | **`full`** polyfill (understand it is not identical to native CSP). |

**Summary:** Baseline-style support means the polyfill is **optional for modern browsers** and **mainly for older or constrained clients** still in your support list.

---

<a id="poly-variants"></a>

## Polyfill variants

### 1. `api_only` (light)

- Defines the **Trusted Types API** so you can call `createPolicy` and use policy methods.
- **`innerHTML = 'raw string'` still works** — there is **no** DOM enforcement.

Use when you only need **API compatibility** and you rely on **your own sanitization** everywhere, or when native enforcement covers your supported modern browsers and you only need a shim elsewhere.

### 2. `full`

- Includes **api_only** behavior plus attempts **type enforcement in the DOM** based on a **CSP policy inferred** from the document (implementation: [`src/polyfill/full.js`](https://github.com/w3c/trusted-types/blob/main/src/polyfill/full.js)).
- In HTML you can pass a policy via **`data-csp`** on the script tag (see example below).

Use when you must approximate enforcement in environments without native TT (understand limitations vs native).

### 3. Tinyfill (minimal shim)

- Does **not** implement enforcement.
- Stubs `trustedTypes.createPolicy` so it returns your **rules object**; `createHTML` etc. return **plain strings** on non-supporting browsers, which legacy sinks accept.

Documented in the upstream README ([**Tinyfill** section](https://github.com/w3c/trusted-types/blob/main/README.md#tinyfill)):

```js
if (typeof trustedTypes === "undefined") {
  globalThis.trustedTypes = { createPolicy: (_name, rules) => rules };
}
```

Same idea, slightly more readable:

```js
if (typeof trustedTypes === "undefined") {
  globalThis.trustedTypes = {
    createPolicy(_name, rules) {
      return rules;
    },
  };
}
```

Allows one codebase to run in **enforcing** browsers (real `TrustedHTML`) and **legacy** browsers (string output), as long as your policy functions always sanitize.

---

<a id="poly-es5"></a>

## Load in the browser (ES5 builds)

Compiled files live in the repo **`dist/`** directory. ES5 CDN script URLs below match the [published `webappsec-trusted-types` ES5 builds](https://w3c.github.io/webappsec-trusted-types/dist/es5/trustedtypes.api_only.build.js); if something 404s, confirm paths in the [upstream **`dist/`** tree](https://github.com/w3c/trusted-types/tree/main/dist) or the [package README](https://github.com/w3c/trusted-types/blob/main/README.md):

### API only

```html
<script src="https://w3c.github.io/webappsec-trusted-types/dist/es5/trustedtypes.api_only.build.js"></script>
<script>
  const p = trustedTypes.createPolicy("foo", {
    createHTML: (s) => /* sanitize */ s,
  });
  document.body.innerHTML = p.createHTML("<b>ok</b>");
  document.body.innerHTML = "<b>still allowed without native enforcement</b>";
</script>
```

### Full (with inferred / inline CSP hint)

```html
<script
  src="https://w3c.github.io/webappsec-trusted-types/dist/es5/trustedtypes.build.js"
  data-csp="trusted-types foo bar; require-trusted-types-for 'script'"
></script>
<script>
  trustedTypes.createPolicy("foo", { createHTML: (s) => s });
  // trustedTypes.createPolicy("unknown", { ... }); // throws if not in trusted-types list
  // document.body.innerHTML = "foo"; // intended to throw under polyfill enforcement
</script>
```

**Important:** Load the polyfill **before** your application code that calls `trustedTypes.createPolicy`. Prefer **first** among your scripts if the rest of the bundle assigns to sinks at parse time.

Also send a **real** CSP header from your server for browsers that implement Trusted Types natively—the `data-csp` attribute is for what the **full** polyfill uses in non-native scenarios (see [upstream README](https://github.com/w3c/trusted-types/blob/main/README.md)).

---

<a id="poly-node"></a>

## Node.js / bundlers (npm)

```sh
npm install trusted-types
```

**CommonJS** (shape per [upstream README — Node.js](https://github.com/w3c/trusted-types/blob/main/README.md#nodejs)):

```js
const tt = require("trusted-types");
// or: import { trustedTypes } from "trusted-types"
tt.createPolicy("myPolicy", {
  createHTML: (input) => sanitize(input),
});
```

**ES modules** — check your package version’s `exports` field; many setups re-export `trustedTypes` on `globalThis` after a side-effect import instead of a named export.

In **Node**, there is usually no DOM—this is for **SSR tests**, **JSDOM**-style setups, or shared isomorphic helpers. For real enforcement, test in a **browser** with CSP.

---

<a id="poly-pair"></a>

## Pairing with application code

### Feature test (same as without polyfill)

```js
if (globalThis.trustedTypes?.createPolicy) {
  const policy = trustedTypes.createPolicy("app", {
    createHTML: (s) => DOMPurify.sanitize(s),
  });
  el.innerHTML = policy.createHTML(userHtml);
}
```

With **api_only** or **tinyfill**, `createPolicy` exists even when there is no native enforcement—your sanitizer is still the security boundary on legacy engines.

### DOMPurify + Trusted Types

DOMPurify can return a trusted type for direct sink assignment (native + polyfill API where applicable):

```js
import DOMPurify from "dompurify";

el.innerHTML = DOMPurify.sanitize(dirty, { RETURN_TRUSTED_TYPE: true });
```

---

<a id="poly-build"></a>

## Building from source (optional)

Upstream clone and build steps: [README — **Building**](https://github.com/w3c/trusted-types/blob/main/README.md#building).

```sh
git clone https://github.com/w3c/trusted-types.git
cd trusted-types
npm install
npm run build
```

---

<a id="poly-demo"></a>

## Demo and tests

- **Demo:** [w3c.github.io/trusted-types/demo](https://w3c.github.io/trusted-types/demo/)
- **Platform tests:** [tests/platform-tests](https://github.com/w3c/trusted-types/tree/main/tests/platform-tests) in the upstream repo

---

<a id="poly-skip"></a>

## When you can skip the polyfill

Same idea as [Which browsers need the polyfill?](#poly-browsers): if your **supported browser matrix** only includes engines with **native** Trusted Types and you always send **`require-trusted-types-for 'script'`**, you may **omit** the polyfill and rely on the platform.

If you still support **older** Chromium / WebKit / Firefox without TT, keep **api_only** or **tinyfill** until those versions fall out of scope.

---

<a id="poly-related"></a>

## Related in this repo

- `README.md` — full patterns and CSP walkthrough; tinyfill lives in **§ H**.
- `playground/` — **DOM XSS** vs **Trusted Types** / **`setHTML()`** demos (`node playground/serve.mjs`); **`playground/README.md`**.

---

<a id="poly-links"></a>

## Links & Resources

- [MDN — Trusted Types API (browser compatibility)](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API#browser_compatibility)
- [Can I use — Trusted Types](https://caniuse.com/trusted-types)
- [W3C Trusted Types (GitHub)](https://github.com/w3c/trusted-types)
- [npm — package `trusted-types`](https://www.npmjs.com/package/trusted-types)
- [web.dev — Trusted Types](https://web.dev/articles/trusted-types)
- [Polyfill source — `full` enforcement (`src/polyfill/full.js`)](https://github.com/w3c/trusted-types/blob/main/src/polyfill/full.js)
- [Polyfill `dist/` tree (CDN / build output paths)](https://github.com/w3c/trusted-types/tree/main/dist)
- Upstream README anchors: [Tinyfill](https://github.com/w3c/trusted-types/blob/main/README.md#tinyfill) · [Node.js](https://github.com/w3c/trusted-types/blob/main/README.md#nodejs) · [Building](https://github.com/w3c/trusted-types/blob/main/README.md#building)
- [Demo (hosted)](https://w3c.github.io/trusted-types/demo/)
- [Platform tests — `tests/platform-tests`](https://github.com/w3c/trusted-types/tree/main/tests/platform-tests)
- ES5 CDN (hosted): [`trustedtypes.api_only.build.js`](https://w3c.github.io/webappsec-trusted-types/dist/es5/trustedtypes.api_only.build.js) · [`trustedtypes.build.js`](https://w3c.github.io/webappsec-trusted-types/dist/es5/trustedtypes.build.js)
