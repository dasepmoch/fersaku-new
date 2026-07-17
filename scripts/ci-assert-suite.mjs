#!/usr/bin/env node
/**
 * QLT-105 — fail CI when a required suite has no real tests/files.
 * Usage: node scripts/ci-assert-suite.mjs <suite-id>
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());

function fail(msg) {
  console.error(`ci-assert-suite: FAIL — ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`ci-assert-suite: OK — ${msg}`);
}

function countFiles(dir, pred) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) n += countFiles(p, pred);
    else if (pred(name, p)) n += 1;
  }
  return n;
}

function minLines(path, min) {
  if (!existsSync(path)) fail(`missing ${path}`);
  const lines = readFileSync(path, "utf8").split(/\r?\n/).length;
  if (lines < min) fail(`${path} has ${lines} lines (need >= ${min})`);
  return lines;
}

const suite = process.argv[2];
if (!suite) {
  fail("usage: node scripts/ci-assert-suite.mjs <suite-id>");
}

switch (suite) {
  case "openapi-contract": {
    minLines(join(root, "backend/api/openapi.yaml"), 100);
    minLines(join(root, "backend/test/contract/openapi_contract_test.go"), 50);
    minLines(join(root, "backend/test/contract/router_inventory.txt"), 50);
    const inv = readFileSync(
      join(root, "backend/test/contract/router_inventory.txt"),
      "utf8",
    )
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (inv.length < 50) {
      fail(`router_inventory has ${inv.length} routes (need >= 50)`);
    }
    minLines(join(root, "shared/api/generated/openapi.ts"), 500);
    ok(
      `openapi + contract tests + inventory(${inv.length}) + generated types present`,
    );
    break;
  }

  case "backend-integration": {
    const n = countFiles(join(root, "backend/test/integration"), (name) =>
      name.endsWith("_test.go"),
    );
    if (n < 10) fail(`integration package has ${n} *_test.go (need >= 10)`);
    minLines(
      join(root, "backend/test/integration/security_verification_test.go"),
      100,
    );
    minLines(join(root, "backend/test/integration/foundation_test.go"), 50);
    ok(`integration suite files=${n} (security + foundation present)`);
    break;
  }

  case "frontend-unit": {
    const n = countFiles(join(root, "tests/unit"), (name) =>
      name.endsWith(".test.ts"),
    );
    if (n < 20) fail(`unit tests: ${n} files (need >= 20)`);
    ok(`unit test files=${n}`);
    break;
  }

  case "frontend-mock-e2e": {
    for (const f of [
      "tests/e2e/smoke.spec.ts",
      "tests/e2e/critical-flows.spec.ts",
      "tests/e2e/accessibility.spec.ts",
      "tests/e2e/visual.spec.ts",
    ]) {
      minLines(join(root, f), 10);
    }
    const shots = join(root, "tests/e2e/__screenshots__");
    if (!existsSync(shots)) fail("missing visual baselines tests/e2e/__screenshots__");
    const desktop = countFiles(join(shots, "desktop-chromium"), (n) =>
      n.endsWith(".png"),
    );
    const mobile = countFiles(join(shots, "mobile-chromium"), (n) =>
      n.endsWith(".png"),
    );
    if (desktop < 5 || mobile < 5) {
      fail(`visual baselines desktop=${desktop} mobile=${mobile} (need >= 5 each)`);
    }
    ok(`mock e2e specs + visual baselines desktop=${desktop} mobile=${mobile}`);
    break;
  }

  case "cross-stack-api-e2e": {
    minLines(join(root, "playwright.api.config.ts"), 20);
    minLines(join(root, "scripts/e2e-api-stack.sh"), 30);
    minLines(join(root, "tests/e2e/api/harness-health.spec.ts"), 20);
    minLines(join(root, "tests/e2e/api/int-190-vertical-slice.spec.ts"), 50);
    if (!existsSync(join(root, "TASK/evidence/QLT-110/seed-ids.json"))) {
      fail("missing QLT-110 seed-ids.json");
    }
    ok("API harness config + stack script + health + INT-190 specs + seed");
    break;
  }

  case "security-negative": {
    const required = [
      "tests/unit/csrf.test.ts",
      "tests/unit/int-020-semantics.test.ts",
      "tests/unit/int-160-query-mutation.test.ts",
      "tests/unit/chk-110-checkout-intent.test.ts",
      "tests/unit/pub-100-public-catalog.test.ts",
      "tests/unit/architecture-boundaries.test.ts",
    ];
    for (const f of required) minLines(join(root, f), 30);
    ok(`security/contract/tenant/idempotency unit files (${required.length})`);
    break;
  }

  default:
    fail(`unknown suite-id: ${suite}`);
}
