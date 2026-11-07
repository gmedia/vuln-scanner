#!/usr/bin/env node
// Form-feedback gate: a mutation without an error path is a silent failure.
//
// Rules (see docs/specs/form-feedback.md):
//   1. Every `useMutation({...})` must declare an `onError` and an `onSuccess`
//      that each surface something, or carry an explicit
//      `// form-feedback: allow <reason>` comment directly above the mutation.
//   2. No component may read `*.detail` itself; use `apiErrorMessage` /
//      `extractApiError` from `src/api/apiErrors.ts`.
//   3. No `String(...detail...)` conversion (renders `[object Object]` on 422).
//   4. No empty / `void 0` / comment-only `catch` block unless annotated with
//      `// silent-catch: allow <reason>`.
//
// Dependency-free on purpose: it runs in CI before any npm install.
// Usage: node scripts/check-form-feedback.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "frontend", "src");
const SKIP = [/\/test\//, /\.test\./, /\/components\/ui\//, /\/e2e\//];
const ALLOW_MARK = "form-feedback: allow";
const CATCH_ALLOW_MARK = "silent-catch: allow";

/** @typedef {{ file: string; line: number; rule: string; message: string }} Finding */
/** @type {Finding[]} */
const findings = [];

/**
 * Replace comments and string/template bodies with spaces, keeping offsets and
 * newlines. Brace/paren matching can then ignore punctuation inside literals.
 * @param {string} text
 */
function mask(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "/" && next === "/") {
      while (i < n && text[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += " ";
      i += 1;
      while (i < n) {
        if (text[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          out += " ";
          i += 1;
          break;
        }
        out += text[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** @param {string} text @param {number} index */
function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

/** @param {string} masked @param {number} openIndex */
function matchingParen(masked, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i += 1) {
    if (masked[i] === "(") depth += 1;
    else if (masked[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * True when the request/statement is immediately preceded by one of the allow
 * markers (as `// <marker> <reason>`). Only the contiguous comment block
 * directly above the statement counts, so a stale allow comment elsewhere in
 * the file cannot silence an unrelated mutation.
 * @param {string} text @param {number} index @param {string[]} marks
 */
function allowComment(text, index, marks = [ALLOW_MARK]) {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  let line = lineStart - 1;
  while (line >= 0) {
    const prevStart = text.lastIndexOf("\n", line - 1) + 1;
    const prev = text.slice(prevStart, line).trim();
    if (prev === "") break;
    if (!prev.startsWith("//")) return false;
    if (marks.some((mark) => prev.includes(mark))) return true;
    line = prevStart - 1;
  }
  return false;
}

/** @param {string} masked @param {number} openIndex */
function matchingBrace(masked, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i += 1) {
    if (masked[i] === "{") depth += 1;
    else if (masked[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Text of an object property value, stopping at the top-level comma/brace. */
function propertyValue(masked, start) {
  let i = start;
  while (i < masked.length && /\s/.test(masked[i])) i += 1;
  const begin = i;
  let depth = 0;
  while (i < masked.length) {
    const ch = masked[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break;
      depth -= 1;
    } else if (ch === "," && depth === 0) break;
    i += 1;
  }
  return masked.slice(begin, i);
}

// A visible error path: toast, the shared form hook, or a named error setter.
const SURFACE_CALL = /\b(?:toast\.(?:error|warning)|apply|set[A-Z]\w*Errors?|setError)\s*\(/;

// A visible success path: toast, a success/result setter, or navigation to the
// created resource. `invalidateQueries()` and closing a dialog do not count.
const SUCCESS_CALL =
  /\b(?:toast(?:\.success)?|navigate|set[A-Z]\w*(?:Success|Saved|Copied|Sent)|setStatusMessage|setResendFeedback)\s*\(|location\.(?:assign|replace)\s*\(|window\.open\s*\(/;

/** @param {string} full @param {string} rel */
function checkFile(full, rel) {
  const text = readFileSync(full, "utf8");
  if (rel === "frontend/src/api/apiErrors.ts") return;
  const masked = mask(text);

  const mutation = /\buseMutation\s*(?:<[^()]*>)?\s*\(/g;
  let match;
  while ((match = mutation.exec(masked)) !== null) {
    const open = masked.indexOf("(", match.index);
    const close = matchingParen(masked, open);
    if (close < 0) continue;
    const body = masked.slice(open + 1, close);
    const onError = /\bonError\s*:/.exec(body);
    if (!onError) {
      if (allowComment(text, match.index)) continue;
      findings.push({
        file: rel,
        line: lineAt(text, match.index),
        rule: "mutation-without-onError",
        message:
          "useMutation has no onError. Add apiErrorMessage()/useApiFormErrors().apply(), or `// form-feedback: allow <reason>`.",
      });
      continue;
    }

    const value = propertyValue(
      masked,
      open + 1 + onError.index + onError[0].length,
    ).trim();
    const isHandlerReference = /^[A-Za-z_$][\w$]*$/.test(value);
    if (!isHandlerReference && !SURFACE_CALL.test(value)) {
      findings.push({
        file: rel,
        line: lineAt(text, match.index),
        rule: "onError-without-surface",
        message:
          "onError does not show anything (e.g. only resets a spinner). Render apiErrorMessage() / useApiFormErrors().apply(), or add `// form-feedback: allow <reason>`.",
      });
    }

    const onSuccess = /\bonSuccess\s*:/.exec(body);
    if (!onSuccess) {
      if (allowComment(text, match.index)) continue;
      findings.push({
        file: rel,
        line: lineAt(text, match.index),
        rule: "mutation-without-onSuccess",
        message:
          "useMutation has no onSuccess. Confirm the write (toast/inline result) or add `// form-feedback: allow <reason>`.",
      });
    } else {
      const successValue = propertyValue(
        masked,
        open + 1 + onSuccess.index + onSuccess[0].length,
      ).trim();
      const isSuccessReference = /^[A-Za-z_$][\w$]*$/.test(successValue);
      if (
        !isSuccessReference
        && !SUCCESS_CALL.test(successValue)
        && !allowComment(text, match.index)
      ) {
        findings.push({
          file: rel,
          line: lineAt(text, match.index),
          rule: "onSuccess-without-surface",
          message:
            "onSuccess only invalidates/closes with no confirmation. Add toast.success()/inline result state, or `// form-feedback: allow <reason>`.",
        });
      }
    }
  }

  const stringDetail = /\bString\s*\([^)]*\.detail\b/g;
  while ((match = stringDetail.exec(masked)) !== null) {
    findings.push({
      file: rel,
      line: lineAt(text, match.index),
      rule: "string-detail",
      message:
        "String(...detail...) renders `[object Object]` for a 422. Use apiErrorMessage(err, fallback).",
    });
  }

  const localExtractor =
    /\b(?:function|const|let|var)\s+(apiDetail|detailFromBody|extractError)\b/g;
  while ((match = localExtractor.exec(masked)) !== null) {
    if (allowComment(text, match.index)) continue;
    findings.push({
      file: rel,
      line: lineAt(text, match.index),
      rule: "local-error-extractor",
      message: `${match[1]}() is a local error reader. Import apiErrorMessage/extractApiError from @/api/apiErrors instead.`,
    });
  }

  const catchRe = /\bcatch\b/g;
  while ((match = catchRe.exec(masked)) !== null) {
    if (allowComment(text, match.index, [ALLOW_MARK, CATCH_ALLOW_MARK])) continue;
    let i = match.index + match[0].length;
    while (i < masked.length && /\s/.test(masked[i])) i += 1;
    if (masked[i] === "(") {
      const paramEnd = matchingParen(masked, i);
      if (paramEnd < 0) continue;
      i = paramEnd + 1;
      while (i < masked.length && /\s/.test(masked[i])) i += 1;
    }
    if (masked[i] !== "{") continue;
    const end = matchingBrace(masked, i);
    if (end < 0) continue;
    const body = masked
      .slice(i + 1, end)
      .replace(/\bvoid\s+0\s*;?/g, "")
      .replace(/[;\s]/g, "");
    if (body !== "") continue;
    findings.push({
      file: rel,
      line: lineAt(text, match.index),
      rule: "empty-catch",
      message:
        "catch block swallows the error. Show it, or add `// silent-catch: allow <reason>`.",
    });
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    const rel = relative(ROOT, full);
    if (SKIP.some((re) => re.test(rel))) continue;
    checkFile(full, rel);
  }
}

walk(SRC);

if (findings.length > 0) {
  console.error(`form-feedback: ${findings.length} violation(s)\n`);
  for (const finding of findings) {
    console.error(
      `  ${finding.file}:${finding.line}  [${finding.rule}] ${finding.message}`,
    );
  }
  console.error(
    "\nContract: docs/specs/form-feedback.md. Never ship a write path without a visible outcome.",
  );
  process.exit(1);
}

console.log("form-feedback: ok");
