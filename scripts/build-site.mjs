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
const MARKDOWN_LIGHT = `${CDN}/github-markdown-css/5.5.1/github-markdown.min.css`;
const MARKDOWN_DARK = `${CDN}/github-markdown-css/5.5.1/github-markdown-dark.min.css`;
const HLJS_VER = "11.11.1";
const HLJS_GITHUB_LIGHT = `${CDN}/highlight.js/${HLJS_VER}/styles/github.min.css`;
const HLJS_GITHUB_DARK = `${CDN}/highlight.js/${HLJS_VER}/styles/github-dark.min.css`;

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "site",
  ".github",
]);

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
      if (trimmed && hljs.getLanguage(trimmed)) {
        return hljs.highlight(code, { language: trimmed }).value;
      }
      if (trimmed) {
        const auto = hljs.highlightAuto(code);
        return auto.value;
      }
      return hljs.highlight(code, { language: "plaintext" }).value;
    },
  })
);

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

function wrapPage({ title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${MARKDOWN_LIGHT}" media="(prefers-color-scheme: light)" crossorigin="anonymous" />
  <link rel="stylesheet" href="${MARKDOWN_DARK}" media="(prefers-color-scheme: dark)" crossorigin="anonymous" />
  <link rel="stylesheet" href="${HLJS_GITHUB_LIGHT}" media="(prefers-color-scheme: light)" crossorigin="anonymous" />
  <link rel="stylesheet" href="${HLJS_GITHUB_DARK}" media="(prefers-color-scheme: dark)" crossorigin="anonymous" />
  <style>
    body { margin: 0; }
    .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 32px 24px 64px; }
    @media (max-width: 767px) { .markdown-body { padding: 16px; } }
    .markdown-body pre code { white-space: pre-wrap; word-break: break-word; }
    .markdown-body pre:has(> code.hljs) { padding: 16px; overflow: auto; border-radius: 6px; }
    .markdown-body pre > code.hljs { padding: 0; background: transparent !important; }
  </style>
</head>
<body>
  <article class="markdown-body">
${bodyHtml}
  </article>
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
    let bodyHtml = marked.parse(raw);
    bodyHtml = rewriteLocalMdLinks(bodyHtml);

    const outHtml = outputHtmlPath(mdAbs);
    ensureDir(path.dirname(outHtml));
    fs.writeFileSync(outHtml, wrapPage({ title, bodyHtml }), "utf8");
  }

  fs.writeFileSync(path.join(outDir, ".nojekyll"), "", "utf8");

  console.log(`Wrote ${mdFiles.length} markdown page(s) to ${path.relative(root, outDir)}/`);
}

main();
