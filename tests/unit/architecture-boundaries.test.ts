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
