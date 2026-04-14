import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hljs from "highlight.js";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "site");

const githubMdLightOverride = fs.readFileSync(
  path.join(__dirname, "github-markdown-light-override.inc.css"),
  "utf8"
);

const CDN = "https://cdnjs.cloudflare.com/ajax/libs";
const MARKDOWN_CSS = `${CDN}/github-markdown-css/5.5.1/github-markdown.min.css`;
const HLJS_VER = "11.11.1";
const HLJS_GITHUB = `${CDN}/highlight.js/${HLJS_VER}/styles/github.min.css`;
const MERMAID_ESM = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";

/** Base URL for canonical, Open Graph, and sitemap (no trailing slash). Override with SITE_URL. */
const DEFAULT_SITE_URL = "https://tt-cheatsheet.javan.de";

/** Footer “author / project” link on every HTML page. Override with FOOTER_SITE_URL. */
const DEFAULT_FOOTER_SITE_URL = "https://about.javan.de/";

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "site",
  ".github",
]);

const ALERT_KINDS = new Set(["note", "tip", "important", "warning", "caution"]);

const ALERT_TITLES = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

marked.use({
  gfm: true,
  mangle: false,
  headerIds: true,
});

marked.use(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const trimmed = (lang || "").trim().toLowerCase();
      if (trimmed === "mermaid") {
        return code;
      }
      if (trimmed && hljs.getLanguage(trimmed)) {
        return hljs.highlight(code, { language: trimmed }).value;
      }
      if (trimmed) {
        return hljs.highlightAuto(code).value;
      }
      return hljs.highlight(code, { language: "plaintext" }).value;
    },
  })
);

marked.use({
  renderer: {
    code(token) {
      const lang = (token.lang || "").match(/\S*/)?.[0]?.toLowerCase();
      if (lang === "mermaid") {
        const code = token.text.replace(/\n$/, "");
        return `<pre class="mermaid">${escapeHtml(code)}</pre>\n`;
      }
      return false;
    },
  },
});

function walkMarkdownFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(name.name)) continue;
    // Playground HTML needs serve.mjs (CSP); do not ship under static site/.
    if (name.isDirectory() && name.name === "playground") {
      continue;
    }
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...walkMarkdownFiles(full));
    else if (name.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Repo-relative markdown path → path under site/ (README.md → index.html). */
function mdRelToSiteHtmlRel(mdRel) {
  const rel = mdRel.replace(/\\/g, "/");
  if (rel === "README.md") return "index.html";
  return rel.replace(/\.md$/i, ".html");
}

function outputHtmlPath(mdAbs) {
  const rel = path.relative(root, mdAbs);
  return path.join(outDir, mdRelToSiteHtmlRel(rel));
}

function titleFromMarkdown(src, fallback) {
  const m = src.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

/**
 * Optional YAML frontmatter at file start (---\n ... \n---\n).
 * Supports simple `key: value` lines; quoted values strip outer quotes.
 */
function splitFrontmatter(raw) {
  if (!raw.startsWith("---\n")) {
    return { meta: {}, body: raw };
  }
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    return { meta: {}, body: raw };
  }
  const fmBlock = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const meta = {};
  for (const line of fmBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body };
}

function normalizeSiteUrl(url) {
  const t = (url || DEFAULT_SITE_URL).trim().replace(/\/+$/, "");
  return t || DEFAULT_SITE_URL;
}

function canonicalUrlForPage(siteBase, htmlRelPosix) {
  const path =
    htmlRelPosix === "index.html" ? "/" : `/${htmlRelPosix}`;
  return `${siteBase}${path}`;
}

function truncateMetaDescription(s, max = 160) {
  const oneLine = s.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  const cut = oneLine.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + "…";
}

function fallbackDescription(title, mdRelPosix) {
  if (mdRelPosix === "POLYFILL.md") {
    return truncateMetaDescription(
      "Official W3C Trusted Types polyfill: api_only and full ES5 builds, tinyfill for old browsers, npm usage, and how native CSP enforcement differs."
    );
  }
  if (mdRelPosix === "README.md") {
    return truncateMetaDescription(
      "Trusted Types and CSP cheatsheet: require-trusted-types-for, trusted-types policies, TrustedHTML and TrustedScript, default policy migration, HTML Sanitizer API (setHTML), Perfect Types, and safe patterns."
    );
  }
  return truncateMetaDescription(`${title} — Trusted Types cheatsheet reference.`);
}

function buildSitemapXml(siteBase, entries) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const htmlRel of entries.sort()) {
    const loc = canonicalUrlForPage(siteBase, htmlRel.replace(/\\/g, "/"));
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(loc)}</loc>`);
    lines.push("    <changefreq>monthly</changefreq>");
    lines.push("  </url>");
  }
  lines.push("</urlset>");
  return lines.join("\n") + "\n";
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip characters that break Markdown [text](url) link labels. */
function safeMdLinkLabel(s) {
  return s
    .replace(/[[\]]/g, "")
    .replace(/`/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * llms.txt — machine-readable site map for LLM / AI crawlers (see https://llmstxt.org/).
 */
function buildLlmsTxt(siteBase, siteName, pages) {
  const primary = pages.filter((p) => p.section === "primary");
  const knowledge = pages.filter((p) => p.section === "knowledge");
  const other = pages.filter(
    (p) => p.section !== "primary" && p.section !== "knowledge"
  );

  function primarySortKey(url) {
    if (url.endsWith("/")) return 0;
    if (url.includes("POLYFILL")) return 1;
    return 2;
  }
  primary.sort(
    (a, b) =>
      primarySortKey(a.url) - primarySortKey(b.url) ||
      a.title.localeCompare(b.title)
  );
  knowledge.sort((a, b) => a.title.localeCompare(b.title));
  other.sort((a, b) => a.title.localeCompare(b.title));

  const linkLine = (p) => {
    const label = safeMdLinkLabel(p.title);
    const blurb = p.description.replace(/\s+/g, " ").trim();
    return `- [${label}](${p.url}): ${blurb}`;
  };

  const lines = [
    `# ${siteName}`,
    "",
    "> Browser Trusted Types, CSP (`require-trusted-types-for`, `trusted-types`), `createPolicy`, TrustedHTML / TrustedScript, HTML Sanitizer API (`setHTML`), Perfect Types (`trusted-types 'none'`), polyfills, and mitigation patterns.",
    "",
    "All pages below are static HTML generated from Markdown. Prefer the homepage for the full structured cheatsheet and table of contents.",
    "",
    "## Core pages",
    ...primary.map(linkLine),
    "",
  ];

  if (knowledge.length) {
    lines.push("## Knowledge base", ...knowledge.map(linkLine), "");
  }
  if (other.length) {
    lines.push("## Other", ...other.map(linkLine), "");
  }

  lines.push(
    "## Discovery",
    `- [Sitemap](${siteBase}/sitemap.xml): all URLs on this site.`,
    `- [robots.txt](${siteBase}/robots.txt): crawling rules (AI crawlers explicitly allowed).`,
    "",
    "This file follows the [llms.txt](https://llmstxt.org/) convention."
  );

  return lines.join("\n") + "\n";
}

/** Common AI / LLM crawlers — explicit Allow (same as `*`, signals intent). */
const AI_CRAWLER_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "Google-Extended",
  "anthropic-ai",
  "ClaudeBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Applebot-Extended",
  "Amazonbot",
  "CCBot",
  "FacebookBot",
  "Meta-ExternalAgent",
];

function buildRobotsTxt(siteBase, sitemapUrl, llmsUrl) {
  const lines = [
    "# Summary for AI assistants and crawlers (Markdown):",
    `# ${llmsUrl}`,
    "",
    ...AI_CRAWLER_USER_AGENTS.flatMap((ua) => [`User-agent: ${ua}`, "Allow: /", ""]),
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${sitemapUrl}`,
  ];
  return lines.join("\n") + "\n";
}

function rewriteLocalMdLinks(html, sourceMdRel) {
  const src = sourceMdRel.replace(/\\/g, "/");
  const mdDir = path.posix.dirname(src);
  const fromHtmlRel = mdRelToSiteHtmlRel(src);
  const fromDir = path.posix.dirname(fromHtmlRel);

  return html.replace(/href="([^"]+)\.md(#[^"]*)?"/gi, (match, p1, hash) => {
    const frag = hash ?? "";
    if (/^(https?:)?\/\//i.test(p1) || p1.startsWith("mailto:")) return match;

    const targetMd = path.posix.normalize(`${mdDir}/${p1}.md`);
    const targetHtmlRel = mdRelToSiteHtmlRel(targetMd);
    const href = path.posix.relative(fromDir, targetHtmlRel);
    return `href="${href}${frag}"`;
  });
}

function fenceDelimiter(line) {
  const m = line.match(/^(\s*)(`{3,}|~{3,})/);
  return m ? m[2] : null;
}

function isFenceCloseLine(line, delim) {
  return line.trim() === delim;
}

function transformGithubAlerts(src) {
  const lines = src.split("\n");
  const out = [];
  let i = 0;
  let fenceDelim = null;

  while (i < lines.length) {
    const line = lines[i];

    if (fenceDelim) {
      out.push(line);
      if (isFenceCloseLine(line, fenceDelim)) fenceDelim = null;
      i++;
      continue;
    }

    const delim = fenceDelimiter(line);
    if (delim) {
      fenceDelim = delim;
      out.push(line);
      i++;
      continue;
    }

    const alertMatch = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
    if (alertMatch) {
      const kind = alertMatch[1].toLowerCase();
      if (!ALERT_KINDS.has(kind)) {
        out.push(line);
        i++;
        continue;
      }
      i++;
      const bodyLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const innerMd = bodyLines.join("\n");
      const innerHtml = marked.parse(transformGithubAlerts(innerMd));
      const title = ALERT_TITLES[kind] || kind;
      out.push(
        `<div class="markdown-alert markdown-alert-${kind}" role="note">\n` +
          `<p class="markdown-alert-title">${escapeHtml(title)}</p>\n` +
          `<div class="markdown-alert-body">\n${innerHtml}</div>\n` +
          `</div>`
      );
      continue;
    }

    out.push(line);
    i++;
  }

  return out.join("\n");
}

function wrapPage({
  title,
  description,
  canonicalUrl,
  siteBase,
  siteName,
  llmsTxtUrl,
  footerSiteUrl,
  robots,
  bodyHtml,
}) {
  const desc = truncateMetaDescription(description);
  const robotsTag =
    robots && robots.toLowerCase().includes("noindex")
      ? `<meta name="robots" content="${escapeHtml(robots)}" />\n  `
      : "";
  const siteUrl = `${siteBase}/`;
  const jsonLdArticle = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description: desc,
    url: canonicalUrl,
    inLanguage: "en",
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
    },
  }).replace(/</g, "\\u003c");
  const jsonLdWebsite = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    inLanguage: "en",
    description:
      "Reference for Trusted Types, CSP, TrustedHTML, HTML Sanitizer API, and Perfect Types. See llms.txt for a machine-readable index.",
    publisher: {
      "@type": "Organization",
      name: siteName,
      url: siteUrl,
    },
  }).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  ${robotsTag}<meta name="description" content="${escapeHtml(desc)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <link rel="alternate" type="text/markdown" href="${escapeHtml(llmsTxtUrl)}" title="llms.txt — overview for AI crawlers" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${escapeHtml(siteName)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(desc)}" />
  <title>${escapeHtml(title)}</title>
  <script type="application/ld+json">${jsonLdArticle}</script>
  <script type="application/ld+json">${jsonLdWebsite}</script>
  <link rel="stylesheet" href="${MARKDOWN_CSS}" crossorigin="anonymous" />
  <link rel="stylesheet" href="${HLJS_GITHUB}" crossorigin="anonymous" />
  <style>
    html { color-scheme: light; }
    html,
    body {
      background-color: #ffffff !important;
      color: #1f2328;
    }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial,
        sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
      font-size: 16px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    @media (prefers-color-scheme: dark) {
      .markdown-body {
${githubMdLightOverride}
      }
    }
    .markdown-body { box-sizing: border-box; min-width: 200px; padding: 32px 20px 64px; }
    main.page-shell { box-sizing: border-box; margin: 0 auto; padding: 0 16px 48px; }
    main.page-shell:not(.has-toc) { max-width: 980px; }
    main.page-shell:not(.has-toc) .markdown-body { max-width: none; margin: 0; }
    main.page-shell.has-toc {
      display: flex;
      align-items: flex-start;
      gap: 28px;
      max-width: 1280px;
    }
    main.page-shell.has-toc .markdown-body {
      flex: 1;
      min-width: 0;
      max-width: 980px;
      margin: 0;
      padding: 32px 0 64px 0;
    }
    .toc-sidebar {
      flex: 0 0 220px;
      position: sticky;
      top: 1rem;
      align-self: flex-start;
      max-height: calc(100vh - 2rem);
      overflow-y: auto;
      overscroll-behavior: contain;
      margin: 0;
      padding: 32px 12px 24px 0;
      border-right: 1px solid var(--color-border-default, #d1d9e0);
      font-family: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
      font-weight: 400;
      color: #1f2328;
    }
    .toc-sidebar[hidden] { display: none !important; }
    .toc-sidebar .toc-title {
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.25;
      text-transform: none;
      letter-spacing: normal;
      margin: 0 0 0.75rem;
      color: #1f2328;
    }
    .toc-sidebar ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .toc-sidebar li {
      margin: 0 0 0.25rem;
    }
    .toc-sidebar a {
      display: block;
      padding: 0.25rem 0 0.25rem 0.625rem;
      margin-left: -0.625rem;
      border-radius: 6px;
      color: #0969da;
      text-decoration: none;
      border-left: 2px solid transparent;
      font-weight: 400;
    }
    .toc-sidebar a:hover {
      color: #0550ae;
      text-decoration: underline;
      background: transparent;
    }
    .toc-sidebar a.is-active {
      font-weight: 600;
      color: #1f2328;
      text-decoration: none;
      border-left-color: #0969da;
      background: rgba(9, 105, 218, 0.06);
    }
    .toc-sidebar a.is-active:hover {
      color: #0550ae;
    }
    .toc-sidebar li.toc-depth-3 a {
      padding-left: 1.125rem;
      font-size: 0.8125rem;
      font-weight: 400;
    }
    .toc-sidebar li.toc-depth-3 a.is-active {
      font-weight: 600;
    }
    .markdown-body h2, .markdown-body h3 { scroll-margin-top: 1rem; }
    @media (max-width: 1100px) {
      main.page-shell.has-toc {
        display: block;
        max-width: 980px;
      }
      main.page-shell.has-toc .toc-sidebar {
        display: none !important;
      }
      main.page-shell.has-toc .markdown-body {
        max-width: none;
        margin: 0;
        padding: 32px 16px 64px;
      }
    }
    .markdown-body > h1:first-of-type { text-align: center; }
    @media (max-width: 767px) {
      main.page-shell {
        padding: 0 8px 36px;
      }
      .markdown-body {
        padding: 16px 8px 40px;
      }
      main.page-shell.has-toc .markdown-body {
        padding: 16px 8px 40px;
      }
    }
    .markdown-body pre code { white-space: pre-wrap; word-break: break-word; }
    .markdown-body pre:has(> code.hljs) { padding: 16px; overflow: auto; border-radius: 6px; }
    .markdown-body pre > code.hljs { padding: 0; background: transparent !important; }
    .markdown-body pre.mermaid {
      margin: 16px 0;
      padding: 12px 16px;
      overflow: auto;
      border-radius: 6px;
      background: var(--color-canvas-subtle, #f6f8fa);
    }
    /* github-markdown-css uses .markdown-body .markdown-alert — match specificity so these win (later in doc). */
    .markdown-body .markdown-alert {
      box-sizing: border-box;
      border-left: 0.25em solid;
      padding-block: 0.6em;
      padding-inline-end: 0.85em;
      padding-inline-start: 1.35em;
      margin: 0 0 16px;
      border-radius: 6px;
    }
    .markdown-body .markdown-alert-title {
      font-weight: 600;
      margin: 0 0 0.5em;
      line-height: 1.25;
    }
    .markdown-body .markdown-alert-body > :first-child { margin-top: 0; }
    .markdown-body .markdown-alert-body > :last-child { margin-bottom: 0; }
    .markdown-body .markdown-alert.markdown-alert-note { border-color: #0969da; background: rgba(9, 105, 218, 0.08); }
    .markdown-body .markdown-alert.markdown-alert-tip { border-color: #1a7f37; background: rgba(26, 127, 55, 0.1); }
    .markdown-body .markdown-alert.markdown-alert-important { border-color: #8250df; background: rgba(130, 80, 223, 0.1); }
    .markdown-body .markdown-alert.markdown-alert-warning { border-color: #9a6700; background: rgba(154, 103, 0, 0.12); }
    .markdown-body .markdown-alert.markdown-alert-caution { border-color: #cf222e; background: rgba(207, 34, 46, 0.08); }
    .site-footer {
      box-sizing: border-box;
      max-width: 1280px;
      margin: 0 auto;
      padding: 1.5rem 1.5rem 2rem;
      border-top: 1px solid var(--color-border-default, #d1d9e0);
      text-align: center;
      font-size: 0.875rem;
      line-height: 1.5;
      color: #59636e;
    }
    .site-footer a {
      color: #0969da;
      text-decoration: none;
    }
    .site-footer a:hover {
      text-decoration: underline;
      color: #0550ae;
    }
    @media (max-width: 767px) {
      .site-footer {
        padding: 1.75rem 0.75rem 2rem;
      }
      .markdown-body .markdown-alert {
        padding-block: 0.5em;
        padding-inline-end: 0.75em;
        padding-inline-start: 1.05em;
      }
    }
  </style>
</head>
<body>
  <main class="page-shell">
  <nav class="toc-sidebar" id="toc-nav" aria-label="On this page" hidden></nav>
  <article class="markdown-body">
${bodyHtml}
  </article>
  </main>
  <footer class="site-footer" role="contentinfo">
    <p><a href="${escapeHtml(footerSiteUrl)}" rel="noopener noreferrer">${escapeHtml(footerLinkLabel(footerSiteUrl))}</a></p>
  </footer>
  <script>
  (function () {
    function initTocScrollSpy() {
      var shell = document.querySelector("main.page-shell");
      var article = document.querySelector("main.page-shell .markdown-body");
      var nav = document.getElementById("toc-nav");
      if (!shell || !article || !nav) return;

      var headingNodes = article.querySelectorAll("h2, h3");
      if (headingNodes.length < 2) return;

      function bookmarkAnchorId(block) {
        if (!block || !block.querySelectorAll) return "";
        var list = block.querySelectorAll("a[id]");
        for (var i = 0; i < list.length; i++) {
          var node = list[i];
          var href = node.getAttribute("href");
          if (href === null || href === "" || href === "#") return node.id;
        }
        return "";
      }

      function slugifyHeading(text) {
        var s = text.replace(/\\s+/g, " ").trim().toLowerCase();
        s = s.replace(/[^a-z0-9\\s-]/g, "");
        s = s.replace(/\\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
        if (!s) s = "section";
        return s;
      }

      var usedIds = Object.create(null);
      var entries = [];
      for (var hi = 0; hi < headingNodes.length; hi++) {
        var h = headingNodes[hi];
        var linkId = "";
        var el = h.previousElementSibling;
        for (var step = 0; step < 16 && el; step++) {
          if (el.tagName === "A" && el.id) {
            var hh = el.getAttribute("href");
            if (hh === null || hh === "" || hh === "#") {
              linkId = el.id;
              break;
            }
          }
          var bid = bookmarkAnchorId(el);
          if (bid) {
            linkId = bid;
            break;
          }
          el = el.previousElementSibling;
        }
        if (!linkId && h.id) linkId = h.id;
        if (!linkId) {
          var base = slugifyHeading(h.textContent);
          linkId = base;
          var n = 0;
          while (usedIds[linkId] || document.getElementById(linkId)) {
            n++;
            linkId = base + "-" + n;
          }
          usedIds[linkId] = true;
          h.id = linkId;
        }
        entries.push({ heading: h, linkId: linkId });
      }

      var title = document.createElement("p");
      title.className = "toc-title";
      title.textContent = "On this page";
      nav.appendChild(title);

      var ul = document.createElement("ul");
      var links = [];
      entries.forEach(function (entry) {
        var h = entry.heading;
        var depth = h.tagName === "H3" ? 3 : 2;
        var li = document.createElement("li");
        li.className = depth === 3 ? "toc-depth-3" : "toc-depth-2";
        var a = document.createElement("a");
        a.href = "#" + entry.linkId;
        a.textContent = h.textContent.replace(/\\s+/g, " ").trim();
        a.dataset.targetId = entry.linkId;
        li.appendChild(a);
        ul.appendChild(li);
        links.push(a);
      });
      nav.appendChild(ul);
      nav.hidden = false;
      shell.classList.add("has-toc");

      function setActive(id) {
        links.forEach(function (a) {
          var on = a.dataset.targetId === id;
          a.classList.toggle("is-active", on);
          if (on) a.setAttribute("aria-current", "location");
          else a.removeAttribute("aria-current");
        });
      }

      var ticking = false;
      var lineY = 96;

      function updateActive() {
        var active = entries[0];
        for (var i = 0; i < entries.length; i++) {
          var rect = entries[i].heading.getBoundingClientRect();
          if (rect.top <= lineY) active = entries[i];
        }
        setActive(active.linkId);
        ticking = false;
      }

      function onScrollOrResize() {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateActive);
        }
      }

      window.addEventListener("scroll", onScrollOrResize, { passive: true });
      window.addEventListener("resize", onScrollOrResize, { passive: true });
      updateActive();

      nav.addEventListener("click", function (e) {
        var t = e.target;
        if (t.tagName !== "A") return;
        setTimeout(updateActive, 0);
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initTocScrollSpy);
    } else {
      initTocScrollSpy();
    }
  })();
  </script>
  <script type="module">
    import mermaid from "${MERMAID_ESM}";
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "strict",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
    });
    await mermaid.run({ querySelector: ".markdown-body pre.mermaid" });
  </script>
</body>
</html>
`;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function footerLinkLabel(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "about.javan.de";
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  ensureDir(outDir);

  const siteBase = normalizeSiteUrl(process.env.SITE_URL);
  const siteName =
    (process.env.SITE_NAME && process.env.SITE_NAME.trim()) ||
    "Trusted Types cheatsheet";
  const footerSiteUrl =
    (process.env.FOOTER_SITE_URL && process.env.FOOTER_SITE_URL.trim()) ||
    DEFAULT_FOOTER_SITE_URL;

  const mdFiles = walkMarkdownFiles(root);
  const sitemapHtmlRels = [];
  const llmsTxtUrl = `${siteBase}/llms.txt`;
  const llmsPages = [];

  for (const mdAbs of mdFiles) {
    const raw = fs.readFileSync(mdAbs, "utf8");
    const rel = path.relative(root, mdAbs);
    const relPosix = rel.replace(/\\/g, "/");
    const { meta, body } = splitFrontmatter(raw);
    const fallbackTitle = rel.replace(/\.md$/i, "");
    const title =
      (meta.title && meta.title.trim()) ||
      titleFromMarkdown(body, fallbackTitle);
    const description =
      (meta.description && meta.description.trim()) ||
      fallbackDescription(title, relPosix);
    const prepped = transformGithubAlerts(body);
    let bodyHtml = marked.parse(prepped);
    bodyHtml = rewriteLocalMdLinks(bodyHtml, rel);

    const htmlRel = mdRelToSiteHtmlRel(relPosix);
    const canonicalUrl = canonicalUrlForPage(siteBase, htmlRel);
    sitemapHtmlRels.push(htmlRel);

    let section = "other";
    if (relPosix === "README.md" || relPosix === "POLYFILL.md") {
      section = "primary";
    } else if (relPosix.startsWith("knowledge/")) {
      section = "knowledge";
    }
    llmsPages.push({ url: canonicalUrl, title, description, section });

    const outHtml = outputHtmlPath(mdAbs);
    ensureDir(path.dirname(outHtml));
    fs.writeFileSync(
      outHtml,
      wrapPage({
        title,
        description,
        canonicalUrl,
        siteBase,
        siteName,
        llmsTxtUrl,
        footerSiteUrl,
        robots: meta.robots || "",
        bodyHtml,
      }),
      "utf8"
    );
  }

  fs.writeFileSync(path.join(outDir, ".nojekyll"), "", "utf8");

  sitemapHtmlRels.push("llms.txt");
  const sitemapUrl = `${siteBase}/sitemap.xml`;
  fs.writeFileSync(
    path.join(outDir, "robots.txt"),
    buildRobotsTxt(siteBase, sitemapUrl, llmsTxtUrl),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "sitemap.xml"),
    buildSitemapXml(siteBase, sitemapHtmlRels),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "llms.txt"),
    buildLlmsTxt(siteBase, siteName, llmsPages),
    "utf8"
  );

  console.log(`Wrote ${mdFiles.length} markdown page(s) to ${path.relative(root, outDir)}/`);
}

main();
