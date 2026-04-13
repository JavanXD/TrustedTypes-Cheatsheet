/**
 * Minimal static server for the playground.
 * Injects CSP on frames/enforced.html and frames/enforced-sanitizer.html only (basename match).
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5190;

/* 'unsafe-inline' only so small single-file demos can run; do not copy verbatim to production. */
const CSP_STRICT =
  "default-src 'none'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "base-uri 'none'; " +
  "require-trusted-types-for 'script'; " +
  "trusted-types myPolicy";

/** Cheatsheet A.3 — no policies; safe HTML via Sanitizer API (`setHTML`), not `innerHTML = string`. */
const CSP_PERFECT_TYPES =
  "default-src 'none'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "base-uri 'none'; " +
  "require-trusted-types-for 'script'; " +
  "trusted-types 'none'";

function safeJoin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(root, normalized);
  if (!full.startsWith(root)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  const filePath = safeJoin(req.url === "/" ? "/index.html" : req.url);
  if (!filePath) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  let data;
  try {
    data = await fs.readFile(filePath);
  } catch {
    res.writeHead(404).end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
  };
  const type = types[ext] || "application/octet-stream";
  const headers = { "Content-Type": type, "X-Content-Type-Options": "nosniff" };

  const base = path.basename(filePath);
  if (base === "enforced.html") headers["Content-Security-Policy"] = CSP_STRICT;
  if (base === "enforced-sanitizer.html") headers["Content-Security-Policy"] = CSP_PERFECT_TYPES;

  res.writeHead(200, headers);
  res.end(data);
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`Playground: http://127.0.0.1:${PORT}/`);
  console.error(
    "CSP response header: frames/enforced.html → CSP_STRICT (trusted-types myPolicy); " +
      "frames/enforced-sanitizer.html → CSP_PERFECT_TYPES (trusted-types 'none'); " +
      "other HTML → no Content-Security-Policy",
  );
});
