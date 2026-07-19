import { defineConfig } from "vitest/config";
import path from "node:path";

// QLT-200 — unit/mapper/contract coverage configuration.
// Include expands from the historical two-file snapshot (http-client + pagination)
// to live adapters, schemas, mappers, policies, and pure security helpers.
//
// Exclusions (written reasons — not silent):
// - shared/api/generated: OpenAPI TS is checked via npm run api:check dirty-diff
//   and backend router/provider contract tests, not line coverage.
// - mock/demo fixtures: not production authority.
// - presentation TSX / providers: visual/UI parity is QLT-230, not unit coverage.
// - config/env bootstrap and pure type barrels (index.ts, contracts type-only).
//
// Coverage is a signal, not a substitute for negative/integration/E2E tests.
// Domain capability cells in 09 §3.7 expand per-domain contract depth; this parent
// only ensures the denominator is honest and the harness exists.

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "json-summary"],
      // Honest denominator: live transport, mappers, policies, feature adapters.
      include: [
        "shared/api/**/*.ts",
        "shared/data/**/*.ts",
        "shared/query/**/*.ts",
        "shared/auth/**/*.ts",
        "shared/seller/**/*.ts",
        "shared/finance/**/*.ts",
        "shared/notifications/**/*.ts",
        "shared/ui/pagination.ts",
        "features/**/api.ts",
        "features/**/mappers.ts",
        "features/**/*policy*.ts",
        "features/**/policy.ts",
        "features/**/server.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/index.ts",
        "**/contracts.ts",
        "shared/api/generated/**",
        "**/*mock*.ts",
        "**/demo-data.ts",
        "**/fixtures/**",
        // React hooks/providers — QLT-230 / component tests, not line coverage.
        "**/hooks.ts",
        "**/create-query.ts",
        "**/create-mutation.ts",
        "**/*-provider.tsx",
        "**/query-provider.tsx",
        "**/domain-source-provider.tsx",
        "**/route-guard.tsx",
        "**/private-surface-shell.tsx",
        "**/buyer-account-shell.tsx",
        "**/*.{tsx,jsx}",
      ],
      // Thresholds apply to the expanded denominator (not the old 2-file set).
      // Raise only when domain QLT-200 cells land more mapper/adapter tests.
      thresholds: {
        lines: 55,
        functions: 50,
        branches: 45,
        statements: 55,
      },
      reportOnFailure: true,
    },
  },
});
