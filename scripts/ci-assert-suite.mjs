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

  case "qlt-210-integration": {
    // Parent framework must stay non-empty and document co-evolution (QLT-210 continuous).
    const foundation = join(
      root,
      "backend/test/integration/foundation_test.go",
    );
    minLines(foundation, 100);
    const foundationSrc = readFileSync(foundation, "utf8");
    for (const needle of [
      "TestMigrateUpFromZero",
      "TestMigrateUpgradeFromSupportedPrevious",
      "TestConcurrentIdempotencyFirstWriterWins",
      "TestAtomicCommitRollbackOnOutboxFailure",
      "sync.WaitGroup",
      "QLT_REQUIRE_INTEGRATION",
    ]) {
      if (!foundationSrc.includes(needle)) {
        fail(`foundation_test.go missing required parent marker: ${needle}`);
      }
    }
    minLines(
      join(root, "backend/test/integration/security_verification_test.go"),
      100,
    );
    minLines(join(root, "docs/QLT-210-INTEGRATION-COEVOLUTION.md"), 40);
    minLines(join(root, "backend/Makefile"), 40);
    const makefile = readFileSync(join(root, "backend/Makefile"), "utf8");
    if (!makefile.includes("test-integration")) {
      fail("backend/Makefile missing test-integration target");
    }
    if (!makefile.includes("QLT_REQUIRE_INTEGRATION")) {
      fail("backend/Makefile test-integration must set QLT_REQUIRE_INTEGRATION");
    }
    const n = countFiles(join(root, "backend/test/integration"), (name) =>
      name.endsWith("_test.go"),
    );
    if (n < 10) fail(`integration package has ${n} *_test.go (need >= 10)`);
    // At least one domain suite must use real concurrent WaitGroup (not foundation alone).
    const domainDir = join(root, "backend/test/integration");
    let concurrentFiles = 0;
    for (const name of readdirSync(domainDir)) {
      if (!name.endsWith("_test.go") || name === "foundation_test.go") continue;
      const src = readFileSync(join(domainDir, name), "utf8");
      if (src.includes("sync.WaitGroup") || src.includes("WaitGroup")) {
        concurrentFiles += 1;
      }
    }
    if (concurrentFiles < 3) {
      fail(
        `domain concurrent race samples=${concurrentFiles} (need >= 3 files with WaitGroup)`,
      );
    }
    ok(
      `qlt-210 harness + foundation migrate/race + co-evolution doc + concurrent domain files=${concurrentFiles} suite=${n}`,
    );
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

  case "qlt-200-contract": {
    // Parent framework must stay non-empty (QLT-200 continuous).
    minLines(join(root, "vitest.config.ts"), 40);
    minLines(join(root, "tests/contract/helpers/consumer.ts"), 40);
    minLines(
      join(root, "tests/contract/qlt-200-consumer-foundation.test.ts"),
      40,
    );
    minLines(
      join(root, "backend/test/contract/provider_presenter_test.go"),
      40,
    );
    minLines(
      join(root, "backend/test/fixtures/contract/featured-products.provider.json"),
      10,
    );
    minLines(join(root, "docs/QLT-200-CONTRACT-COEVOLUTION.md"), 30);
    const n = countFiles(join(root, "tests/contract"), (name) =>
      name.endsWith(".test.ts"),
    );
    if (n < 1) fail(`contract tests: ${n} files (need >= 1)`);
    ok(`qlt-200 harness + consumer tests=${n} + provider sample`);
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
    minLines(join(root, "tests/e2e/api/qlt-220-parent-framework.spec.ts"), 40);
    minLines(join(root, "tests/e2e/api/helpers/auth.ts"), 40);
    if (!existsSync(join(root, "TASK/evidence/QLT-110/seed-ids.json"))) {
      fail("missing QLT-110 seed-ids.json");
    }
    // Mock must stay isolated from API suite registration.
    const mockCfg = readFileSync(join(root, "playwright.config.ts"), "utf8");
    if (!mockCfg.includes("**/api/**")) {
      fail("playwright.config.ts must testIgnore **/api/** (mock vs API isolation)");
    }
    const apiCfg = readFileSync(join(root, "playwright.api.config.ts"), "utf8");
    if (!apiCfg.includes("api-desktop-chromium")) {
      fail("playwright.api.config.ts missing api-desktop-chromium project");
    }
    if (!apiCfg.includes("NEXT_PUBLIC_DATA_SOURCE")) {
      fail("playwright.api.config.ts must force NEXT_PUBLIC_DATA_SOURCE=api");
    }
    const apiSpecs = countFiles(join(root, "tests/e2e/api"), (name) =>
      name.endsWith(".spec.ts"),
    );
    if (apiSpecs < 3) {
      fail(`API e2e specs=${apiSpecs} (need >= 3: health + INT-190 + QLT-220 parent)`);
    }
    ok(
      `API harness + stack + health + INT-190 + QLT-220 parent + auth helper + seed (specs=${apiSpecs})`,
    );
    break;
  }

  case "qlt-220-api-e2e": {
    // Parent framework must stay non-empty and document co-evolution (QLT-220 continuous).
    minLines(join(root, "docs/QLT-220-API-E2E-COEVOLUTION.md"), 40);
    minLines(join(root, "playwright.api.config.ts"), 40);
    minLines(join(root, "playwright.config.ts"), 20);
    minLines(join(root, "scripts/e2e-api-stack.sh"), 40);
    minLines(join(root, "tests/e2e/api/harness-health.spec.ts"), 40);
    minLines(join(root, "tests/e2e/api/int-190-vertical-slice.spec.ts"), 80);
    minLines(join(root, "tests/e2e/api/qlt-220-parent-framework.spec.ts"), 80);
    minLines(join(root, "tests/e2e/api/helpers/auth.ts"), 80);
    minLines(join(root, "tests/e2e/api/helpers/env.ts"), 30);
    minLines(join(root, "tests/e2e/api/helpers/mailpit.ts"), 40);
    minLines(join(root, "tests/e2e/api/helpers/callback.ts"), 40);

    const mockCfg = readFileSync(join(root, "playwright.config.ts"), "utf8");
    for (const needle of [
      'testIgnore: ["**/api/**"]',
      "desktop-chromium",
      "mobile-chromium",
    ]) {
      if (!mockCfg.includes(needle)) {
        fail(`playwright.config.ts missing mock registration marker: ${needle}`);
      }
    }

    const apiCfg = readFileSync(join(root, "playwright.api.config.ts"), "utf8");
    for (const needle of [
      "api-desktop-chromium",
      "NEXT_PUBLIC_DATA_SOURCE",
      "retain-on-failure",
      "tests/e2e/api",
    ]) {
      if (!apiCfg.includes(needle)) {
        fail(`playwright.api.config.ts missing API registration marker: ${needle}`);
      }
    }

    const authSrc = readFileSync(
      join(root, "tests/e2e/api/helpers/auth.ts"),
      "utf8",
    );
    for (const needle of [
      "loginViaApi",
      "writeEphemeralStorageState",
      "clearEphemeralAuthState",
      "sanitizeAuthSummary",
      "isBlockedMockUrl",
      "test-results",
      ".auth",
    ]) {
      if (!authSrc.includes(needle)) {
        fail(`helpers/auth.ts missing parent marker: ${needle}`);
      }
    }

    const parentSrc = readFileSync(
      join(root, "tests/e2e/api/qlt-220-parent-framework.spec.ts"),
      "utf8",
    );
    for (const needle of [
      "QLT-220",
      "loginViaApi",
      "isBlockedMockUrl",
      "harness-health",
      "int-190",
    ]) {
      if (!parentSrc.includes(needle)) {
        fail(`qlt-220-parent-framework.spec.ts missing marker: ${needle}`);
      }
    }

    const coevo = readFileSync(
      join(root, "docs/QLT-220-API-E2E-COEVOLUTION.md"),
      "utf8",
    );
    for (const needle of [
      "co-evolution",
      "capability cell",
      "tests/e2e/api",
      "INT-190",
      "harness-health",
    ]) {
      if (!coevo.toLowerCase().includes(needle.toLowerCase())) {
        fail(`QLT-220 co-evolution doc missing marker: ${needle}`);
      }
    }

    if (!existsSync(join(root, "TASK/evidence/QLT-110/seed-ids.json"))) {
      fail("missing QLT-110 seed-ids.json");
    }

    const apiSpecs = countFiles(join(root, "tests/e2e/api"), (name) =>
      name.endsWith(".spec.ts"),
    );
    if (apiSpecs < 3) {
      fail(`API e2e specs=${apiSpecs} (need >= 3)`);
    }

    ok(
      `qlt-220 parent harness + mock/API registration + auth + INT-190/health samples + co-evolution (specs=${apiSpecs})`,
    );
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
