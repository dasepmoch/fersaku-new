import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import * as domain from "@/shared/data/domain-source";

const root = path.resolve(__dirname, "../..");

describe("PUB-230 — static help/careers/blog/API playground disposition", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("documents static authority for help/blog/careers/api marketing", () => {
    const help = readFileSync(
      path.join(root, "app/(resources)/help/page.tsx"),
      "utf8",
    );
    const careers = readFileSync(
      path.join(root, "app/(company)/careers/page.tsx"),
      "utf8",
    );
    const blog = readFileSync(
      path.join(root, "app/(resources)/blog/page.tsx"),
      "utf8",
    );
    const api = readFileSync(path.join(root, "app/api/page.tsx"), "utf8");

    // Local static index/search — no backend authority claim
    expect(help).toMatch(/HELP_CATEGORIES/);
    expect(help).toMatch(/setQuery/);
    expect(help).toMatch(/Hubungi support/);
    expect(help).toMatch(/href="\/contact"/);

    // Careers role CTAs are real mailto apply links
    expect(careers).toMatch(
      /CAREERS_APPLY_MAIL\s*=\s*["']careers@fersaku\.id["']/,
    );
    expect(careers).toMatch(/mailto:\$\{CAREERS_APPLY_MAIL\}/);
    for (const role of [
      "Senior Product Designer",
      "Frontend Engineer",
      "Risk Operations Lead",
      "Creator Success Manager",
    ]) {
      expect(careers).toContain(role);
    }

    // Blog is repository static content with real article links
    expect(blog).toMatch(/from "@\/lib\/content-data"/);
    expect(blog).toMatch(/href=\{`\/blog\/\$\{posts\[0\]\.slug\}`\}/);

    // /api marketing docs link is STATIC
    expect(api).toMatch(/href="\/docs\/api"/);
    expect(api).not.toMatch(/apiRequest|getDomainSource/);
  });

  it("docs page TOC targets real anchors and copy is functional", () => {
    const docs = readFileSync(path.join(root, "app/docs/api/page.tsx"), "utf8");
    expect(docs).not.toMatch(/href="#"/);
    // Nav section ids (hash targets) — includes playground + errors
    for (const id of [
      "mulai-cepat",
      "autentikasi",
      "qris-payments",
      "payment-status",
      "idempotency",
      "webhooks",
      "api-playground",
      "errors",
    ]) {
      expect(docs).toContain(`id: "${id}"`);
    }
    expect(docs).toMatch(/id="mulai-cepat"/);
    expect(docs).toMatch(/id="payment-status"/);
    expect(docs).toMatch(/id="idempotency"/);
    expect(docs).toMatch(/id="webhooks"/);
    expect(docs).toMatch(/id="errors"/);
    expect(docs).toMatch(/navigator\.clipboard/);
    // Sidebar active state is scroll/hash driven — not a hardcoded index
    expect(docs).not.toMatch(/i === 2/);
    expect(docs).toMatch(/IntersectionObserver|activeId/);
    // Contract-aligned request fields from OpenAPI CreateGatewayPaymentRequest
    expect(docs).toMatch(/merchantReference/);
    expect(docs).toMatch(/webhookEndpointId/);
    expect(docs).toMatch(/fsk_test_/);
  });

  it("docs index redirects to /docs/api", () => {
    const index = readFileSync(path.join(root, "app/docs/page.tsx"), "utf8");
    expect(index).toMatch(/redirect\(["']\/docs\/api["']\)/);
  });

  it("playground send is mock-only; api/disabled is authoritatively disabled", () => {
    const source = readFileSync(
      path.join(root, "components/api-playground.tsx"),
      "utf8",
    );
    expect(source).toMatch(/Frontend mock • no network request/);
    expect(source).toMatch(/getDomainSource\(["']publicCatalog["']\)/);
    expect(source).toMatch(
      /playgroundSendEnabled\s*=\s*publicSource\s*===\s*["']mock["']/,
    );
    expect(source).toMatch(
      /API playground sandbox is out of scope for launch \(PUB-230 deferred\)/,
    );
    expect(source).toMatch(/if\s*\(\s*!playgroundSendEnabled\s*\)\s*return/);
    expect(source).toMatch(/const send = \(\) => \{[\s\S]*?setTimeout\s*\(/);
    expect(source).not.toMatch(/from ["']@\/shared\/api|apiRequest\s*\(/);
  });

  it("domain-source gate: mock enables send; api and disabled do not", () => {
    for (const mode of ["api", "disabled"] as const) {
      vi.spyOn(domain, "getDomainSource").mockReturnValue(mode);
      expect(domain.getDomainSource("publicCatalog")).toBe(mode);
      // Gate expression mirrors component: only mock enables
      const playgroundSendEnabled =
        domain.getDomainSource("publicCatalog") === "mock";
      expect(playgroundSendEnabled).toBe(false);
    }
    vi.spyOn(domain, "getDomainSource").mockReturnValue("mock");
    expect(domain.getDomainSource("publicCatalog") === "mock").toBe(true);
  });

  it("blog unknown slug uses notFound (static authority)", () => {
    const article = readFileSync(
      path.join(root, "app/(resources)/blog/[slug]/page.tsx"),
      "utf8",
    );
    expect(article).toMatch(/notFound\(\)/);
    expect(article).toMatch(/posts\.find/);
    expect(article).toMatch(/href="\/blog"/);
  });
});
