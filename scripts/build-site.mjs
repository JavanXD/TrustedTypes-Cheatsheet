import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hljs from "highlight.js";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "site");

const CDN = "https://cdnjs.cloudflare.com/ajax/libs";
const MARKDOWN_CSS = `${CDN}/github-markdown-css/5.5.1/github-markdown.min.css`;
const HLJS_VER = "11.11.1";
const HLJS_GITHUB = `${CDN}/highlight.js/${HLJS_VER}/styles/github.min.css`;
const MERMAID_ESM = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";

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
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...walkMarkdownFiles(full));
    else if (name.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function outputHtmlPath(mdAbs) {
  const rel = path.relative(root, mdAbs);
  if (rel === "README.md") return path.join(outDir, "index.html");
  return path.join(outDir, rel.replace(/\.md$/i, ".html"));
}

function titleFromMarkdown(src, fallback) {
  const m = src.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function rewriteLocalMdLinks(html) {
  return html.replace(/href="([^"]+)\.md(#[^"]*)?"/gi, (match, p1, hash = "") => {
    if (/^(https?:)?\/\//i.test(p1) || p1.startsWith("mailto:")) return match;
    return `href="${p1}.html${hash}"`;
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

function wrapPage({ title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${MARKDOWN_CSS}" crossorigin="anonymous" />
  <link rel="stylesheet" href="${HLJS_GITHUB}" crossorigin="anonymous" />
  <style>
    html { color-scheme: light; }
    body { margin: 0; background: #ffffff; color: #1f2328; }
    .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 32px 24px 64px; }
    @media (max-width: 767px) { .markdown-body { padding: 16px; } }
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
    .markdown-alert {
      border-left: 0.25em solid;
      padding: 0.75em 1em;
      margin: 0 0 16px;
      border-radius: 6px;
    }
    .markdown-alert-title {
      font-weight: 600;
      margin: 0 0 0.5em;
      line-height: 1.25;
    }
    .markdown-alert-body > :first-child { margin-top: 0; }
    .markdown-alert-body > :last-child { margin-bottom: 0; }
    .markdown-alert-note { border-color: #0969da; background: rgba(9, 105, 218, 0.08); }
    .markdown-alert-tip { border-color: #1a7f37; background: rgba(26, 127, 55, 0.1); }
    .markdown-alert-important { border-color: #8250df; background: rgba(130, 80, 223, 0.1); }
    .markdown-alert-warning { border-color: #9a6700; background: rgba(154, 103, 0, 0.12); }
    .markdown-alert-caution { border-color: #cf222e; background: rgba(207, 34, 46, 0.08); }
  </style>
</head>
<body>
  <article class="markdown-body">
${bodyHtml}
  </article>
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

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  ensureDir(outDir);

  const playgroundSrc = path.join(root, "playground");
  if (fs.existsSync(playgroundSrc)) {
    fs.cpSync(playgroundSrc, path.join(outDir, "playground"), { recursive: true });
  }

  const mdFiles = walkMarkdownFiles(root);
  for (const mdAbs of mdFiles) {
    const raw = fs.readFileSync(mdAbs, "utf8");
    const rel = path.relative(root, mdAbs);
    const fallbackTitle = rel.replace(/\.md$/i, "");
    const title = titleFromMarkdown(raw, fallbackTitle);
    const prepped = transformGithubAlerts(raw);
    let bodyHtml = marked.parse(prepped);
    bodyHtml = rewriteLocalMdLinks(bodyHtml);

    const outHtml = outputHtmlPath(mdAbs);
    ensureDir(path.dirname(outHtml));
    fs.writeFileSync(outHtml, wrapPage({ title, bodyHtml }), "utf8");
  }

  fs.writeFileSync(path.join(outDir, ".nojekyll"), "", "utf8");

  console.log(`Wrote ${mdFiles.length} markdown page(s) to ${path.relative(root, outDir)}/`);
}

main();
