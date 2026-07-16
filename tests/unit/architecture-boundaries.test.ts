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
