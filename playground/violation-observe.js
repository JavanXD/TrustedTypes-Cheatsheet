"use strict";

/**
 * Cheatsheet README.md § G — "Seeing violations in the browser"
 *
 * Observers are registered the first time your playground log() runs, so
 * createPlaygroundViolationAwareLog() / lazy attach stay tied to the same function
 * violations will call into.
 *
 * Optional: before a sink runs, call setPlaygroundSinkContext(el, "innerHTML") (or a
 * plain string). That text is appended to § G log lines so reviewers see *where* the
 * sink was executed (element + parent).
 *
 * Only load this script from documents that actually send a TT-related CSP (e.g.
 * enforced.html, enforced-sanitizer.html). A page with no CSP has nothing useful
 * for ReportingObserver / securitypolicyviolation for Trusted Types — use a plain
 * log() on those pages (see vulnerable.html).
 */

/** @type {string} */
let playgroundSinkDebug = "";

/**
 * Remember which sink is about to run (consumed when the next § G line is logged).
 * @param {Element | string} elOrNote - target element, or a free-form debug string
 * @param {string} [opLabel] - e.g. "innerHTML", "eval" (used when first arg is an Element)
 */
function setPlaygroundSinkContext(elOrNote, opLabel) {
  if (typeof elOrNote === "string") {
    playgroundSinkDebug = elOrNote;
    return;
  }
  if (elOrNote && elOrNote.nodeType === 1 && opLabel) {
    playgroundSinkDebug = opLabel + " @ " + describeElementBrief(elOrNote);
    return;
  }
  playgroundSinkDebug = elOrNote ? describeElementBrief(elOrNote) : "";
}

let sinkDebugClearScheduled = false;

/** Append optional sink context; clear once after this turn so both § G paths can read it. */
function appendSinkDebugTo(line) {
  if (!playgroundSinkDebug) return line;
  const out = line + " | sink: " + playgroundSinkDebug;
  if (!sinkDebugClearScheduled) {
    sinkDebugClearScheduled = true;
    queueMicrotask(() => {
      playgroundSinkDebug = "";
      sinkDebugClearScheduled = false;
    });
  }
  return out;
}

/** One-line element + parent (for violation log context). */
function describeElementBrief(el) {
  if (!el || el.nodeType !== 1) return String(el);
  const tag = el.tagName.toLowerCase();
  const id = el.id ? "#" + el.id : "";
  const classes = el.className && typeof el.className === "string" ? el.className.trim().split(/\s+/) : [];
  const cls = classes.length ? "." + classes.slice(0, 2).join(".") : "";
  const parent = el.parentElement;
  let parentBit = "";
  if (parent && parent.nodeType === 1) {
    const pt = parent.tagName.toLowerCase();
    const pid = parent.id ? "#" + parent.id : "";
    const pcls = parent.className && typeof parent.className === "string" && parent.className.trim()
      ? "." + parent.className.trim().split(/\s+/).slice(0, 1).join(".")
      : "";
    parentBit = `; parent=<${pt}${pid}${pcls}>`;
  }
  return `<${tag}${id}${cls}>${parentBit}`;
}

/** Extra fields from SecurityPolicyViolationEvent (location + target when exposed). */
function summarizeSecurityPolicyViolationExtra(e) {
  const parts = [];
  if (e.sourceFile) parts.push(`sourceFile=${e.sourceFile}`);
  if (e.lineNumber != null) parts.push(`line=${e.lineNumber}`);
  if (e.columnNumber != null) parts.push(`col=${e.columnNumber}`);
  if (e.documentURI) parts.push(`document=${truncateUrl(e.documentURI, 96)}`);
  try {
    if (e.target && e.target.nodeType === 1) {
      parts.push(`event.target=${describeElementBrief(e.target)}`);
    }
  } catch {
    /* ignore cross-realm */
  }
  return parts.length ? "; " + parts.join("; ") : "";
}

function truncateUrl(s, max) {
  if (typeof s !== "string" || s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * @param {(line: string) => void} log - playground log (also mirrored to console by caller)
 */
function attachPlaygroundViolationLogging(log) {
  if (typeof log !== "function") {
    throw new TypeError("attachPlaygroundViolationLogging: expected log function");
  }

  if (typeof ReportingObserver === "function") {
    const observer = new ReportingObserver((reports) => {
      for (const report of reports) {
        if (report.type !== "csp-violation") continue;
        if (report.body.effectiveDirective !== "require-trusted-types-for") continue;
        let summary = "";
        try {
          summary = summarizeCspReportBody(report.body);
        } catch (e) {
          summary = "(could not serialize report.body: " + e.name + ")";
        }
        try {
          log(appendSinkDebugTo("ReportingObserver [require-trusted-types-for]: " + summary));
        } catch (e) {
          console.warn("ReportingObserver callback failed:", e);
        }
      }
    }, { buffered: true });
    observer.observe();
  } else {
    log("ReportingObserver API missing — using securitypolicyviolation only.");
  }

  document.addEventListener("securitypolicyviolation", (e) => {
    // README § G uses console.error here; playground uses only log() → one console line.
    const base = [e.violatedDirective, e.blockedURI, e.sample].filter(Boolean).join(" | ");
    log(
      appendSinkDebugTo(
        "securitypolicyviolation: " + base + summarizeSecurityPolicyViolationExtra(e),
      ),
    );
  });
}

/**
 * Returns log(msg) that mirrors README § G: first call runs attachPlaygroundViolationLogging(log)
 * then prints a one-line “observers installed” note, then behaves as a normal logger.
 *
 * @param {string} scopeLabel - prefix for console.log (e.g. "[enforced.html]")
 */
function createPlaygroundViolationAwareLog(scopeLabel) {
  let attached = false;
  function log(msg) {
    if (!attached) {
      attached = true;
      const boot =
        "§ G violation observers installed (ReportingObserver + securitypolicyviolation).";
      console.log(scopeLabel, boot);
      const bootEl = document.getElementById("log");
      if (bootEl) bootEl.textContent += boot + "\n";
      try {
        attachPlaygroundViolationLogging(log);
      } catch (e) {
        console.warn(scopeLabel, "§ G attach failed (ReportingObserver / listener):", e);
        const el = document.getElementById("log");
        if (el) {
          el.textContent +=
            "§ G attach failed: " + e.name + " — " + e.message + " (securitypolicyviolation may still work).\n";
        }
      }
    }
    console.log(scopeLabel, msg);
    const el = document.getElementById("log");
    if (el) el.textContent += msg + "\n";
  }
  return log;
}

function summarizeCspReportBody(body) {
  if (!body || typeof body !== "object") return String(body);
  const pick = [
    ["effectiveDirective", body.effectiveDirective],
    ["blockedURL", body.blockedURL],
    ["documentURL", body.documentURL],
    ["disposition", body.disposition],
    ["sample", typeof body.sample === "string" ? body.sample.slice(0, 160) : body.sample],
    ["statusCode", body.statusCode],
    ["lineNumber", body.lineNumber],
    ["columnNumber", body.columnNumber],
    ["sourceFile", body.sourceFile],
  ];
  return pick
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" && v.length > 120 ? v.slice(0, 119) + "…" : v}`)
    .join("; ");
}
