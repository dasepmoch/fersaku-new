import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COOKIE_STORAGE_INVENTORY,
  HAS_THIRD_PARTY_MARKETING_COOKIES,
  LEGAL_BANNED_PHRASES,
  LEGAL_CONTACTS,
  LEGAL_DOC_VERSION,
  LEGAL_EFFECTIVE_DATE,
} from "@/lib/legal-public-surface";

const root = path.resolve(__dirname, "../..");

const LEGAL_PAGES = [
  "app/(legal)/privacy/page.tsx",
  "app/(legal)/terms/page.tsx",
  "app/(legal)/cookies/page.tsx",
] as const;

const PUBLIC_MARKETING_PAGES = [
  ...LEGAL_PAGES,
  "app/(company)/contact/page.tsx",
  "app/(company)/about/page.tsx",
  "app/(company)/careers/page.tsx",
  "app/(resources)/help/page.tsx",
  "app/(resources)/security/page.tsx",
] as const;

const FAKE_ADDRESS_PATTERNS = [
  /\b123\s+Main\s+St\b/i,
  /\bLorem\s+Ipsum\b/i,
  /\bfake@example\.com\b/i,
  /\btest@test\.com\b/i,
  /\bxxx@xxx\b/i,
  /\blocalhost:\d{2,5}\b/,
  /\b127\.0\.0\.1:\d+\b/,
];

function readRel(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function walkTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTsx(full);
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")
      ? [full]
      : [];
  });
}

describe("GAP-09 — legal / public surface honesty", () => {
  it("legal pages carry version + effective date and omit banned launch phrases", () => {
    for (const rel of LEGAL_PAGES) {
      const source = readRel(rel);
      expect(source).toContain("LEGAL_DOC_VERSION");
      expect(source).toContain("LEGAL_EFFECTIVE_DATE");
      for (const phrase of LEGAL_BANNED_PHRASES) {
        expect(source.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
      expect(source).not.toMatch(/\bplaceholder\b/i);
    }
  });

  it("exports stable version metadata for evidence", () => {
    expect(LEGAL_DOC_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-/);
    expect(LEGAL_EFFECTIVE_DATE.length).toBeGreaterThan(4);
    expect(LEGAL_CONTACTS.privacy).toBe("privacy@fersaku.id");
    expect(LEGAL_CONTACTS.support).toBe("support@fersaku.id");
  });

  it("cookie inventory is first-party and documents no third-party marketing cookies", () => {
    expect(HAS_THIRD_PARTY_MARKETING_COOKIES).toBe(false);
    expect(COOKIE_STORAGE_INVENTORY.length).toBeGreaterThanOrEqual(3);
    expect(
      COOKIE_STORAGE_INVENTORY.some((i) => i.id === "fersaku_session"),
    ).toBe(true);
    expect(COOKIE_STORAGE_INVENTORY.some((i) => i.id === "fersaku-theme")).toBe(
      true,
    );
    const cookiesPage = readRel("app/(legal)/cookies/page.tsx");
    expect(cookiesPage).toMatch(/COOKIE_STORAGE_INVENTORY/);
    expect(cookiesPage).toMatch(/HAS_THIRD_PARTY_MARKETING_COOKIES/);
    expect(cookiesPage).not.toMatch(
      /Implementasi production harus menyediakan consent/,
    );
  });

  it("contact deferred: disabled outside mock, no fake success path, real support emails", () => {
    const source = readRel("app/(company)/contact/page.tsx");
    expect(source).toMatch(/contactSubmitEnabled = publicSource === "mock"/);
    expect(source).toMatch(/disabled=\{!contactSubmitEnabled\}/);
    expect(source).toMatch(
      /Contact submit is out of scope for launch \(PUB-200 deferred\)/,
    );
    expect(source).toMatch(/if\s*\(\s*!contactSubmitEnabled\s*\)\s*return/);
    expect(source).toMatch(/sent && contactSubmitEnabled/);
    expect(source).toMatch(/LEGAL_CONTACTS/);
    expect(source).toMatch(/Pengiriman formulir belum tersedia|tidak tersedia/);
    expect(source).not.toMatch(
      /\/v1\/public\/contact|contact-messages|submitContact|postContact/i,
    );
  });

  it("public marketing pages reject fake addresses and dev-only hosts", () => {
    for (const rel of PUBLIC_MARKETING_PAGES) {
      const source = readRel(rel);
      for (const re of FAKE_ADDRESS_PATTERNS) {
        expect(source).not.toMatch(re);
      }
    }
  });

  it("app legal route tree has no banned trust-blocker phrases", () => {
    const legalDir = path.join(root, "app/(legal)");
    const files = walkTsx(legalDir);
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const phrase of LEGAL_BANNED_PHRASES) {
        expect(source.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
      // Word "placeholder" banned in legal route copy (not HTML input attrs elsewhere).
      expect(source).not.toMatch(/\bplaceholder\b/i);
    }
  });

  it("footer still links privacy/terms/cookies and contact", () => {
    const footer = readRel("components/footer.tsx");
    expect(footer).toMatch(/href="\/privacy"/);
    expect(footer).toMatch(/href="\/terms"/);
    expect(footer).toMatch(/href="\/cookies"/);
    expect(footer).toMatch(/["']\/contact["']/);
  });
});
