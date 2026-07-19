import { describe, expect, it } from "vitest";
import type { CatalogProduct } from "@/features/catalog/contracts";
import {
  filterStorefrontProducts,
  mapPublicStorefrontDto,
  mapSafeInstagramHref,
  mapSafeStorefrontSocials,
  mapSafeWebsiteHref,
  mapSafeYoutubeHref,
  normalizeProductSearch,
  parseSafeHttpsUrl,
  publicProductHref,
  SAFE_EXTERNAL_LINK_REL,
  SAFE_EXTERNAL_LINK_TARGET,
} from "@/features/catalog/mappers";
import { getDemoStorefront } from "@/features/catalog/mock";

function product(
  overrides: Partial<CatalogProduct> & Pick<CatalogProduct, "id" | "slug" | "title">,
): CatalogProduct {
  return {
    short: overrides.short ?? "Short",
    description: "Long",
    price: 10_000,
    type: "download",
    sales: 1,
    palette: "violet",
    glyph: "✦",
    includes: ["PDF"],
    ...overrides,
  };
}

describe("PUB-210 storefront product search", () => {
  it("normalizes and filters within fixed product list (empty query keeps all)", () => {
    const items = [
      product({ id: "a", slug: "ai-prompt", title: "AI Prompt Pack", short: "prompts" }),
      product({ id: "b", slug: "design-kit", title: "Design Kit", short: "assets" }),
      product({ id: "c", slug: "shared-pack", title: "Shared Pack", short: "shared" }),
    ];
    expect(normalizeProductSearch("  AI  ")).toBe("ai");
    expect(filterStorefrontProducts(items, undefined).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(filterStorefrontProducts(items, "   ").map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(filterStorefrontProducts(items, "prompt").map((p) => p.id)).toEqual([
      "a",
    ]);
    expect(filterStorefrontProducts(items, "shared").map((p) => p.id)).toEqual([
      "c",
    ]);
    expect(filterStorefrontProducts(items, "zzz").map((p) => p.id)).toEqual([]);
  });

  it("search result href stays on canonical store slug (dual-tenant same product slug)", () => {
    const slug = "shared-pack";
    const a = publicProductHref("asep-ai-tools", slug);
    const b = publicProductHref("designkit-studio", slug);
    expect(a).toBe("/@asep-ai-tools/shared-pack");
    expect(b).toBe("/@designkit-studio/shared-pack");
    expect(a).not.toBe(b);
  });
});

describe("PUB-210 safe social links", () => {
  it("maps bare handles and https URLs for instagram/youtube/website", () => {
    expect(mapSafeInstagramHref("asep.ai")).toBe(
      "https://www.instagram.com/asep.ai/",
    );
    expect(mapSafeInstagramHref("@designkit.studio")).toBe(
      "https://www.instagram.com/designkit.studio/",
    );
    expect(mapSafeInstagramHref("https://www.instagram.com/asep.ai/")).toBe(
      "https://www.instagram.com/asep.ai/",
    );
    expect(mapSafeYoutubeHref("DesignKit")).toBe(
      "https://www.youtube.com/@DesignKit",
    );
    expect(mapSafeYoutubeHref("https://www.youtube.com/@DesignKit")).toBe(
      "https://www.youtube.com/@DesignKit",
    );
    expect(mapSafeYoutubeHref("https://youtu.be/abc123")).toBe(
      "https://youtu.be/abc123",
    );
    expect(mapSafeWebsiteHref("asep.ai")).toBe("https://asep.ai/");
    expect(mapSafeWebsiteHref("https://asep.ai/tools")).toBe(
      "https://asep.ai/tools",
    );
  });

  it("rejects malicious schemes, credentials, and wrong hosts", () => {
    expect(mapSafeInstagramHref("javascript:alert(1)")).toBeUndefined();
    expect(mapSafeWebsiteHref("javascript:alert(1)")).toBeUndefined();
    expect(mapSafeWebsiteHref("data:text/html,hi")).toBeUndefined();
    expect(mapSafeWebsiteHref("http://insecure.example")).toBeUndefined();
    expect(
      mapSafeInstagramHref("https://user:pass@instagram.com/x"),
    ).toBeUndefined();
    expect(mapSafeInstagramHref("https://evil.com/phish")).toBeUndefined();
    expect(mapSafeYoutubeHref("https://evil.com/@x")).toBeUndefined();
    expect(mapSafeWebsiteHref("#")).toBeUndefined();
    expect(mapSafeWebsiteHref("")).toBeUndefined();
    expect(parseSafeHttpsUrl("https://localhost/x")).toBeNull();
  });

  it("omits missing or unsafe socials from the map", () => {
    expect(
      mapSafeStorefrontSocials({
        instagram: "javascript:x",
        website: "https://ok.example",
        youtube: "",
      }),
    ).toEqual({ website: "https://ok.example/" });
    expect(mapSafeStorefrontSocials({})).toEqual({});
  });

  it("mapPublicStorefrontDto sanitizes socials (no raw # or javascript)", () => {
    const view = mapPublicStorefrontDto({
      slug: "t",
      name: "T",
      monogram: "T",
      bio: "b",
      products: [],
      socials: {
        instagram: "javascript:alert(1)",
        website: "https://safe.example",
        youtube: "https://evil.com/y",
      },
    } as never);
    expect(view.socials.instagram).toBeUndefined();
    expect(view.socials.youtube).toBeUndefined();
    expect(view.socials.website).toBe("https://safe.example/");
  });

  it("demo storefronts expose only safe https social hrefs when present", () => {
    const asep = getDemoStorefront("asep-ai-tools");
    expect(asep).not.toBeNull();
    if (!asep) return;
    if (asep.socials.instagram) {
      expect(asep.socials.instagram.startsWith("https://")).toBe(true);
      expect(asep.socials.instagram).toContain("instagram.com");
    }
    if (asep.socials.website) {
      expect(asep.socials.website.startsWith("https://")).toBe(true);
    }
    expect(asep.socials.youtube).toBeUndefined();

    const design = getDemoStorefront("designkit-studio");
    expect(design).not.toBeNull();
    if (!design) return;
    if (design.socials.youtube) {
      expect(design.socials.youtube.startsWith("https://")).toBe(true);
      expect(
        design.socials.youtube.includes("youtube.com") ||
          design.socials.youtube.includes("youtu.be"),
      ).toBe(true);
    }
  });

  it("exports safe external link attributes", () => {
    expect(SAFE_EXTERNAL_LINK_REL).toBe("noopener noreferrer");
    expect(SAFE_EXTERNAL_LINK_TARGET).toBe("_blank");
  });
});
