import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const sourceRoots = ["app", "components", "features", "shared", "lib"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return sourceExtensions.has(path.extname(entry.name)) ? [file] : [];
  });
}

const files = sourceRoots.flatMap((directory) =>
  sourceFiles(path.join(root, directory)),
);

function importsOf(file: string): string[] {
  const content = readFileSync(file, "utf8");
  return [...content.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)].map(
    ([, specifier]) => specifier,
  );
}

function resolveImport(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) {
    return undefined;
  }

  const candidate = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : path.resolve(path.dirname(from), specifier);
  const attempts = [
    candidate,
    ...[".ts", ".tsx", ".js", ".jsx"].map(
      (extension) => `${candidate}${extension}`,
    ),
    ...[".ts", ".tsx", ".js", ".jsx"].map((extension) =>
      path.join(candidate, `index${extension}`),
    ),
  ];
  return attempts.find((attempt) => {
    try {
      return statSync(attempt).isFile();
    } catch {
      return false;
    }
  });
}

function relativeSource(file: string) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

describe("module architecture boundaries", () => {
  it("keeps shared modules independent from app, components, features, and lib", () => {
    const violations: string[] = [];
    for (const file of files.filter((candidate) =>
      relativeSource(candidate).startsWith("shared/"),
    )) {
      for (const specifier of importsOf(file)) {
        const imported = resolveImport(file, specifier);
        if (!imported) continue;
        const target = relativeSource(imported);
        if (/^(app|components|features|lib)\//.test(target)) {
          violations.push(`${relativeSource(file)} -> ${target}`);
        }
      }
    }

    expect(
      violations,
      "shared must not depend on higher-level modules",
    ).toEqual([]);
  });

  it("keeps fixture imports behind data adapters and mock modules", () => {
    const violations: string[] = [];
    for (const file of files) {
      const relative = relativeSource(file);
      const isAdapter =
        relative.includes("/data/") ||
        relative.endsWith("/mock.ts") ||
        relative.endsWith("/mock.tsx");
      if (isAdapter) continue;

      for (const specifier of importsOf(file)) {
        if (!specifier.startsWith("@/lib/") || !specifier.includes("mock-data"))
          continue;
        violations.push(`${relative} -> ${specifier}`);
      }
    }

    expect(
      violations,
      "presentation modules must consume feature data APIs, not *mock-data",
    ).toEqual([]);
  });

  it("keeps generated OpenAPI transport out of presentation modules", () => {
    const violations: string[] = [];
    for (const file of files) {
      const relative = relativeSource(file);
      if (
        relative.startsWith("shared/api/") ||
        relative.includes("/mappers.ts") ||
        relative.includes("/transport.ts") ||
        relative.includes("/schemas.ts") ||
        relative.endsWith("/api.ts")
      ) {
        continue;
      }
      for (const specifier of importsOf(file)) {
        if (
          specifier.includes("shared/api/generated") ||
          specifier.endsWith("/generated/openapi")
        ) {
          violations.push(`${relative} -> ${specifier}`);
        }
      }
    }
    expect(
      violations,
      "screens/components must not import transport generated types",
    ).toEqual([]);
  });

  it("forbids new direct isLiveApi() outside shared/data registry (INT-025)", () => {
    const allowed = new Set([
      "shared/data/mode.ts",
      "shared/data/domain-source.ts",
    ]);
    const violations: string[] = [];
    for (const file of files) {
      const relative = relativeSource(file);
      if (allowed.has(relative)) continue;
      if (relative.startsWith("tests/")) continue;
      const content = readFileSync(file, "utf8");
      if (/\bisLiveApi\s*\(/.test(content) || /from\s*["']@\/shared\/data\/mode["']/.test(content)) {
        violations.push(relative);
      }
    }
    expect(
      violations,
      "use getDomainSource/shouldUseMockFixtures; do not call isLiveApi in features/app",
    ).toEqual([]);
  });

  it("keeps API_INTERNAL_URL server-only and out of NEXT_PUBLIC_* (INT-030)", () => {
    const envSource = readFileSync(
      path.join(root, "shared/config/env.ts"),
      "utf8",
    );
    expect(envSource).toMatch(/API_INTERNAL_URL/);
    expect(envSource).not.toMatch(/NEXT_PUBLIC_API_INTERNAL/);
    // publicEnv must not surface internal URL
    expect(envSource).toMatch(/Never put secrets or API_INTERNAL_URL/);

    const violations: string[] = [];
    for (const file of files) {
      const relative = relativeSource(file);
      if (relative === "shared/config/env.ts") continue;
      if (relative === "shared/api/server-http-client.ts") continue;
      if (relative.startsWith("tests/")) continue;
      if (relative.startsWith("TASK/")) continue;
      const content = readFileSync(file, "utf8");
      if (/process\.env\.NEXT_PUBLIC_API_INTERNAL/.test(content)) {
        violations.push(relative);
      }
      // Client bundles must not import getApiInternalUrl / requireApiInternalUrl
      // from feature presentation; only server modules may (INT-110).
      if (
        (relative.startsWith("features/") ||
          relative.startsWith("components/") ||
          relative.startsWith("app/")) &&
        /from\s*["']@\/shared\/config\/env["']/.test(content) &&
        /(getApiInternalUrl|requireApiInternalUrl)/.test(content)
      ) {
        violations.push(`${relative}: imports server-only internal URL helper`);
      }
    }
    expect(violations, "API_INTERNAL_URL must stay server-only").toEqual([]);
  });

  it("keeps server-http-client out of client components (INT-110)", () => {
    const serverClientSource = readFileSync(
      path.join(root, "shared/api/server-http-client.ts"),
      "utf8",
    );
    expect(serverClientSource).toMatch(/import\s+["']server-only["']/);
    expect(serverClientSource).toMatch(/requireApiInternalUrl/);
    expect(serverClientSource).toMatch(/no-store/);
    expect(serverClientSource).toMatch(/buildForwardedCookieHeader|Cookie/);

    const policy = readFileSync(
      path.join(root, "shared/api/SERVER-SSR-POLICY.md"),
      "utf8",
    );
    expect(policy).toMatch(/serverApiRequest/);
    expect(policy).toMatch(/API_INTERNAL_URL/);

    const violations: string[] = [];
    for (const file of files) {
      const relative = relativeSource(file);
      if (relative.startsWith("shared/api/")) continue;
      if (relative.startsWith("tests/")) continue;
      const content = readFileSync(file, "utf8");
      // "use client" modules must never import server HTTP client
      if (
        /["']use client["']/.test(content) &&
        /server-http-client|serverApiRequest/.test(content)
      ) {
        violations.push(`${relative}: client module imports server SSR client`);
      }
    }
    expect(
      violations,
      "Client Components must not import server-http-client",
    ).toEqual([]);
  });

  it("forbids presentation screens from reading NEXT_PUBLIC data-source flags (INT-025)", () => {
    const violations: string[] = [];
    for (const file of files) {
      const relative = relativeSource(file);
      // adapters + shared config may touch env; screens/components must not
      if (
        relative.startsWith("shared/") ||
        relative.endsWith("/api.ts") ||
        relative.includes("/data/") ||
        relative.endsWith("/mock.ts") ||
        relative.endsWith("/mock.tsx")
      ) {
        continue;
      }
      if (
        !relative.startsWith("app/") &&
        !relative.startsWith("components/") &&
        !relative.startsWith("features/")
      ) {
        continue;
      }
      // hooks under features are data layer helpers — allow domain-source only
      const content = readFileSync(file, "utf8");
      if (
        /process\.env\.NEXT_PUBLIC_DATA_SOURCE/.test(content) ||
        /process\.env\.NEXT_PUBLIC_APP_STAGE/.test(content) ||
        /publicEnv\.dataSource/.test(content)
      ) {
        violations.push(relative);
      }
    }
    expect(
      violations,
      "screens/hooks must not read env/flags for data source; use domain registry",
    ).toEqual([]);
  });

  it("requires schema on live feature apiRequest calls (INT-100)", () => {
    const violations: string[] = [];
    const adapterFiles = files.filter((file) => {
      const relative = relativeSource(file);
      return (
        relative.startsWith("features/") &&
        (relative.endsWith("/api.ts") || relative.includes("/data/")) &&
        !relative.endsWith(".test.ts")
      );
    });

    for (const file of adapterFiles) {
      const content = readFileSync(file, "utf8");
      if (!content.includes("apiRequest")) continue;
      // Scan each apiRequest invocation for schema option
      let searchFrom = 0;
      while (true) {
        const idx = content.indexOf("apiRequest", searchFrom);
        if (idx === -1) break;
        const lineStart = content.lastIndexOf("\n", idx) + 1;
        const lineEnd = content.indexOf("\n", idx);
        const line = content.slice(
          lineStart,
          lineEnd === -1 ? undefined : lineEnd,
        );
        if (/\bimport\b/.test(line)) {
          searchFrom = idx + 10;
          continue;
        }
        const open = content.indexOf("(", idx);
        if (open === -1) break;
        let depth = 0;
        let j = open;
        let inStr: string | null = null;
        while (j < content.length) {
          const ch = content[j];
          if (inStr) {
            if (ch === "\\") {
              j += 2;
              continue;
            }
            if (ch === inStr) inStr = null;
            j += 1;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === "`") {
            inStr = ch;
            j += 1;
            continue;
          }
          if (ch === "(") depth += 1;
          else if (ch === ")") {
            depth -= 1;
            if (depth === 0) {
              j += 1;
              break;
            }
          }
          j += 1;
        }
        const call = content.slice(idx, j);
        // 204-only voids may omit schema; still require schema option key present
        // for non-empty success paths — enforce schema: for all feature calls
        if (!/\bschema\s*:/.test(call)) {
          violations.push(
            `${relativeSource(file)}:${content.slice(0, idx).split("\n").length}`,
          );
        }
        searchFrom = j;
      }
    }

    expect(
      violations,
      "live feature adapters must pass schema: to apiRequest (INT-100)",
    ).toEqual([]);
  });

  it("INT-170: production presentation must not import feature mock as authority", () => {
    /**
     * Dependency-graph gate (not broad text grep): presentation modules may not
     * resolve-import feature mock fixtures, DEMO_STORE_ID authority, or browser
     * mock audit as business authority.
     *
     * Explicit exemptions (INT-170): mock adapters, hooks placeholder wiring,
     * tests, shared mock runtime, theme storage, static docs, api playground.
     */
    const violations: string[] = [];

    const isExemptPresentation = (relative: string) => {
      if (relative.startsWith("tests/")) return true;
      if (relative.startsWith("shared/mock/")) return true;
      if (relative.endsWith("/mock.ts") || relative.endsWith("/mock.tsx"))
        return true;
      if (relative.endsWith("/mock-audit.ts")) return true;
      if (relative.endsWith("/client-audit.ts")) return true;
      if (relative.includes("/data/") && relative.endsWith(".ts")) return true;
      if (relative.endsWith("/api.ts")) return true;
      if (relative.endsWith("/contracts.ts")) return true;
      if (relative.endsWith("/hooks.ts") || relative.endsWith("/hooks.tsx"))
        return true;
      if (relative.includes("/impersonation/")) return true;
      if (relative === "components/api-playground.tsx") return true;
      if (relative === "components/mock-interaction-boundary.tsx") return true;
      // Shared seller bootstrap / current-store gate DEMO_STORE_ID for mock only
      if (
        relative === "shared/seller/bootstrap-api.ts" ||
        relative === "shared/seller/current-store.tsx" ||
        relative === "shared/config/demo.ts"
      ) {
        return true;
      }
      // Finance demo-data is fixture helper used by mock adapters
      if (relative === "features/finance/demo-data.ts") return true;
      if (relative === "features/finance/mock-withdrawals.ts") return true;
      // Shells currently host prototype impersonation chrome (domain follow-up)
      if (
        relative === "features/seller/components/dashboard-shell.tsx" ||
        relative === "features/admin/components/admin-shell.tsx"
      ) {
        return true;
      }
      return false;
    };

    const isFeatureMockModule = (target: string) => {
      if (!target.startsWith("features/")) return false;
      if (target.endsWith("/mock.ts") || target.endsWith("/mock.tsx"))
        return true;
      if (target.endsWith("/mock-audit.ts")) return true;
      // mock-* helpers under feature data (not client-audit facade)
      if (/\/mock[-_]/.test(target) && !target.endsWith("/client-audit.ts"))
        return true;
      return false;
    };

    for (const file of files) {
      const relative = relativeSource(file);
      if (isExemptPresentation(relative)) continue;

      // Focus on presentation surfaces: app routes, components, feature screens/ui
      const isPresentation =
        relative.startsWith("app/") ||
        relative.startsWith("components/") ||
        (relative.startsWith("features/") &&
          (relative.includes("/screens/") ||
            relative.includes("/ui/") ||
            relative.includes("/components/") ||
            relative.includes("/domains/") ||
            relative.includes("/panels/") ||
            relative.includes("/preview/") ||
            relative.endsWith(".tsx")));
      if (!isPresentation) continue;

      for (const specifier of importsOf(file)) {
        const imported = resolveImport(file, specifier);
        if (!imported) continue;
        const target = relativeSource(imported);

        if (isFeatureMockModule(target)) {
          violations.push(`${relative} -> ${target} (feature mock)`);
        }

        // Browser mock audit must not be presentation authority outside shells/adapters
        if (target === "features/admin/data/mock-audit.ts") {
          violations.push(`${relative} -> ${target} (mock audit)`);
        }
      }

      // DEMO_STORE_ID as authority: app pages must gate with domain-source mock
      const content = readFileSync(file, "utf8");
      if (
        relative.startsWith("app/") &&
        /DEMO_STORE_ID/.test(content) &&
        !/getDomainSource|shouldUseMockFixtures|isDomainMock/.test(content)
      ) {
        violations.push(
          `${relative}: DEMO_STORE_ID without domain-source mock gate`,
        );
      }
    }

    expect(
      violations,
      "API presentation must not reach feature mock / unguarded DEMO_STORE_ID / mock audit authority",
    ).toEqual([]);
  });

  it("INT-170: shared foundation must not import feature mock or mock-audit", () => {
    const violations: string[] = [];
    for (const file of files.filter((candidate) =>
      relativeSource(candidate).startsWith("shared/"),
    )) {
      const relative = relativeSource(file);
      if (relative.startsWith("shared/mock/")) continue;
      for (const specifier of importsOf(file)) {
        const imported = resolveImport(file, specifier);
        if (!imported) continue;
        const target = relativeSource(imported);
        if (
          target.startsWith("features/") &&
          (target.includes("/mock") || target.endsWith("mock-audit.ts"))
        ) {
          violations.push(`${relative} -> ${target}`);
        }
      }
    }
    expect(
      violations,
      "shared/* must not depend on feature mock / mock-audit",
    ).toEqual([]);
  });

  it("PUB-200: contact submit is authoritatively disabled in API mode", () => {
    /**
     * Contact is OUT-OF-SCOPE for launch (no public contact endpoint; UXE-010
     * has no field-error/pending/general-error region). Mock may keep local
     * prototype setSent; API/disabled must set disabled + title and must never
     * set sent=true without backend acceptance.
     */
    const contactPage = path.join(root, "app/(company)/contact/page.tsx");
    const contactSource = readFileSync(contactPage, "utf8");

    expect(contactSource).toMatch(/Kirim pesan/);
    expect(contactSource).toMatch(/getDomainSource\(["']publicCatalog["']\)/);
    expect(contactSource).toMatch(/contactSubmitEnabled/);
    expect(contactSource).toMatch(/disabled=\{!contactSubmitEnabled\}/);
    expect(contactSource).toMatch(
      /Contact submit is out of scope for launch \(PUB-200 deferred\)/,
    );
    // Guard: local success only after mock-enabled gate (never unconditional setSent(true) on submit)
    expect(contactSource).toMatch(
      /if\s*\(\s*!contactSubmitEnabled\s*\)\s*return/,
    );
    expect(contactSource).not.toMatch(
      /onClick=\{\(\)\s*=>\s*setSent\(true\)\}/,
    );
    // No contact transport mounted until product re-opens as IMPLEMENT
    expect(contactSource).not.toMatch(
      /\/v1\/public\/contact|contact-messages|submitContact|postContact/i,
    );
  });

  it("AUT-130: seller Google OAuth is authoritatively disabled in API mode", () => {
    /**
     * OAuth is OUT-OF-SCOPE for launch. Seller AuthShell Google control must be
     * mode-gated: mock may keep prototype affordance; API/disabled must set
     * disabled + title (never no-op / fake-success). BuyerLogin must not gain Google.
     */
    const authShell = path.join(root, "components/auth-shell.tsx");
    const shellSource = readFileSync(authShell, "utf8");

    expect(shellSource).toMatch(/Lanjutkan dengan/);
    expect(shellSource).toMatch(/Google/);
    expect(shellSource).toMatch(/getDomainSource\(["']auth["']\)/);
    expect(shellSource).toMatch(/googleOAuthEnabled/);
    expect(shellSource).toMatch(/disabled=\{!googleOAuthEnabled\}/);
    expect(shellSource).toMatch(
      /Google sign-in is out of scope for launch \(AUT-130 deferred\)/,
    );
    // No OAuth start/callback transport on the shell (disposition title may mention OAuth)
    expect(shellSource).not.toMatch(
      /\/v1\/auth\/oauth|oauth\/callback|openid-connect|accounts\.google\.com|pkce/i,
    );
    expect(shellSource).not.toMatch(/onClick|href=.*google|window\.location/i);

    const buyerLogin = path.join(root, "components/buyer-login.tsx");
    const buyerSource = readFileSync(buyerLogin, "utf8");
    expect(buyerSource).not.toMatch(
      /Lanjutkan dengan Google|Google sign-in|accounts\.google/i,
    );

    // Auth feature adapters must not mount OAuth transport for launch
    const authFeatureDir = path.join(root, "features/auth");
    const authFiles = sourceFiles(authFeatureDir);
    const oauthViolations: string[] = [];
    for (const file of authFiles) {
      const content = readFileSync(file, "utf8");
      if (
        /\/v1\/auth\/oauth|oauth\/callback|openid-connect|accounts\.google\.com/i.test(
          content,
        )
      ) {
        oauthViolations.push(relativeSource(file));
      }
    }
    expect(
      oauthViolations,
      "features/auth must not wire OAuth endpoints until product re-opens AUT-130 as IMPLEMENT",
    ).toEqual([]);
  });

  it("INT-175: forbids store-scoped objects for personal profile media", () => {
    /**
     * Personal avatar/photo is launch-deferred (DISABLED/OUT-OF-SCOPE).
     * Store object routes (`/v1/stores/{storeId}/objects...`) are for product/store
     * assets only (SEL-230). Profile surfaces must not call them for personal media.
     */
    const storeObjectPath =
      /\/v1\/stores\/[^"'`\s]+\/objects|stores\/\$\{[^}]+}\/objects|\/objects\/uploads/;
    const personalMediaContext =
      /avatar|photo|profile.?media|Upload new photo|PROFILE_ASSET|avatarRef/i;
    const profileSurface =
      /profile|buyer-profile|account\/profile|admin\/profile|seller-settings|seller-profile/i;

    const violations: string[] = [];

    for (const file of files) {
      const relative = relativeSource(file);
      if (relative.startsWith("shared/api/generated/")) continue;
      if (relative.endsWith(".test.ts") || relative.endsWith(".test.tsx"))
        continue;

      const content = readFileSync(file, "utf8");
      if (!storeObjectPath.test(content)) continue;

      const isProfileSurface =
        profileSurface.test(relative) || profileSurface.test(content);
      const isPersonalMedia =
        personalMediaContext.test(relative) ||
        personalMediaContext.test(content);

      // Profile presentation/adapters must never wire store object upload for personal media
      if (
        (relative.startsWith("features/") ||
          relative.startsWith("app/") ||
          relative.startsWith("components/")) &&
        (isProfileSurface || isPersonalMedia) &&
        storeObjectPath.test(content)
      ) {
        // Seller product/store asset adapters may use store objects — only forbid when
        // the same file also targets personal avatar/photo lifecycle.
        const personalUploadIntent =
          /avatarRef|Upload new photo|PROFILE_ASSET|personal.?avatar|profile.?photo|profile.?media/i.test(
            content,
          ) && storeObjectPath.test(content);
        if (personalUploadIntent || (isProfileSurface && isPersonalMedia)) {
          violations.push(
            `${relative}: store-scoped objects must not serve personal profile media (INT-175)`,
          );
        }
      }
    }

    // Authoritative disabled control: admin photo upload must remain disabled
    const adminProfile = path.join(
      root,
      "features/admin/screens/access/profile.tsx",
    );
    const adminSource = readFileSync(adminProfile, "utf8");
    expect(adminSource).toMatch(/Upload new photo/);
    expect(adminSource).toMatch(/disabled/);
    // Must not enable upload handler or store object call
    expect(adminSource).not.toMatch(storeObjectPath);
    expect(adminSource).not.toMatch(/\/v1\/me\/objects/);

    // Buyer profile is initials-only (no upload control)
    const buyerProfile = path.join(
      root,
      "features/buyer/screens/buyer-profile.tsx",
    );
    const buyerSource = readFileSync(buyerProfile, "utf8");
    expect(buyerSource).not.toMatch(storeObjectPath);
    expect(buyerSource).not.toMatch(/Upload new photo|\/v1\/me\/objects/);

    expect(
      violations,
      "do not use /v1/stores/{storeId}/objects for personal avatar/photo",
    ).toEqual([]);
  });

  it("has no cycles between internal source modules", () => {
    const graph = new Map<string, string[]>();
    for (const file of files) {
      graph.set(
        file,
        importsOf(file)
          .map((specifier) => resolveImport(file, specifier))
          .filter((resolved): resolved is string => Boolean(resolved)),
      );
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const cycles: string[] = [];

    function visit(file: string, stack: string[]) {
      if (visiting.has(file)) {
        const cycleStart = stack.indexOf(file);
        cycles.push(
          [...stack.slice(cycleStart), file].map(relativeSource).join(" -> "),
        );
        return;
      }
      if (visited.has(file)) return;
      visiting.add(file);
      for (const dependency of graph.get(file) || [])
        visit(dependency, [...stack, file]);
      visiting.delete(file);
      visited.add(file);
    }

    for (const file of files) visit(file, []);
    expect(cycles, "internal import cycles must remain empty").toEqual([]);
  });
});
