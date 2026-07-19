#!/usr/bin/env node
/**
 * npm audit gate: block critical/high always; allow moderate only if listed
 * in docs/security/npm-advisory-exceptions.json and not expired.
 *
 * Usage (from frontend/ or with cwd frontend):
 *   node ../scripts/security/npm-audit-gate.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const FRONTEND = path.join(ROOT, "frontend");
const EXCEPTIONS_PATH = path.join(ROOT, "docs/security/npm-advisory-exceptions.json");

function fail(msg) {
  console.error("npm-audit-gate FAIL:", msg);
  process.exit(1);
}

function loadExceptions() {
  if (!fs.existsSync(EXCEPTIONS_PATH)) {
    fail(`missing exceptions file: ${EXCEPTIONS_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(EXCEPTIONS_PATH, "utf8"));
  const now = Date.now();
  const active = new Map();
  for (const ex of raw.exceptions || []) {
    if (!ex.id) continue;
    const exp = Date.parse(ex.expiresAt + "T23:59:59Z");
    if (Number.isNaN(exp) || exp < now) {
      console.warn(`npm-audit-gate: expired exception ignored: ${ex.id} expiresAt=${ex.expiresAt}`);
      continue;
    }
    if (String(ex.severity).toLowerCase() === "critical" || String(ex.severity).toLowerCase() === "high") {
      fail(`exception ${ex.id} cannot waive critical/high`);
    }
    active.set(ex.id, ex);
    // Also index bare GHSA without path prefixes from npm
    if (ex.id.startsWith("GHSA-")) active.set(ex.id, ex);
  }
  return active;
}

function collectVulns(audit) {
  const vulns = [];
  const v = audit.vulnerabilities || {};
  for (const [name, meta] of Object.entries(v)) {
    if (!meta || typeof meta !== "object") continue;
    const via = Array.isArray(meta.via) ? meta.via : [];
    for (const item of via) {
      if (typeof item === "string") continue;
      vulns.push({
        name,
        severity: (item.severity || meta.severity || "unknown").toLowerCase(),
        id: item.url ? String(item.url).split("/").pop() : item.source != null ? String(item.source) : null,
        title: item.title || name,
        range: item.range || meta.range,
        fixAvailable: meta.fixAvailable,
      });
    }
    if (via.length === 0 && meta.severity) {
      vulns.push({
        name,
        severity: String(meta.severity).toLowerCase(),
        id: null,
        title: name,
        range: meta.range,
        fixAvailable: meta.fixAvailable,
      });
    }
  }
  return vulns;
}

const r = spawnSync("npm", ["audit", "--json"], {
  cwd: FRONTEND,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
// npm audit exits non-zero when vulns found; still parse stdout
let audit;
try {
  audit = JSON.parse(r.stdout || "{}");
} catch {
  fail(`npm audit JSON parse failed (exit ${r.status}): ${(r.stderr || "").slice(0, 500)}`);
}

const exceptions = loadExceptions();
const vulns = collectVulns(audit);
const blockers = [];
const waived = [];

for (const v of vulns) {
  const sev = v.severity;
  if (sev === "critical" || sev === "high") {
    blockers.push({ ...v, reason: "critical/high not allowed" });
    continue;
  }
  if (sev === "moderate") {
    const ex = (v.id && exceptions.get(v.id)) || null;
    // also match package-level mitigated override when decision=mitigated and 0 vulns expected
    if (ex && (ex.decision === "accepted" || ex.decision === "mitigated")) {
      waived.push({ ...v, exceptionId: ex.id, expiresAt: ex.expiresAt });
      continue;
    }
    blockers.push({ ...v, reason: "moderate without active owner waiver" });
    continue;
  }
  // low/info: report only
}

// Lockfile hash evidence
const lockPath = path.join(FRONTEND, "package-lock.json");
const lockHash = fs.existsSync(lockPath)
  ? spawnSync("sha256sum", [lockPath], { encoding: "utf8" }).stdout.trim().split(/\s+/)[0]
  : "missing";

console.log(
  JSON.stringify(
    {
      ok: blockers.length === 0,
      vulnerabilityCount: vulns.length,
      blockers: blockers.length,
      waived: waived.length,
      packageLockSha256: lockHash,
      blockersDetail: blockers,
      waivedDetail: waived,
    },
    null,
    2,
  ),
);

if (blockers.length > 0) {
  process.exit(1);
}
console.log("npm-audit-gate: PASS");
