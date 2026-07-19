import { initialStorefrontConfig } from "./config";
import type { BuilderConfig } from "./types";
import { z } from "zod";
import {
  readVersionedStorage,
  writeVersionedStorage,
} from "@/shared/storage/versioned-storage";

export type StorefrontDraft = {
  config: BuilderConfig;
  logoStyle: "letter" | "spark" | "image";
};

export const STOREFRONT_DRAFT_KEY = "fersaku-storefront-draft";

const draftSchema = z.object({
  config: z
    .object({
      template: z.string(),
      name: z.string(),
      tagline: z.string(),
      bio: z.string(),
      announcement: z.string(),
      announcementEnabled: z.boolean(),
      accent: z.string(),
      ink: z.string(),
      canvas: z.string(),
      layout: z.string(),
      hero: z.string(),
      cards: z.string(),
      texture: z.string(),
      radius: z.string(),
      font: z.string(),
      align: z.string(),
      density: z.string(),
      showSearch: z.boolean(),
      showSales: z.boolean(),
      showRatings: z.boolean(),
      featuredIds: z.array(z.string()),
      sections: z.array(
        z.object({ id: z.string(), label: z.string(), visible: z.boolean() }),
      ),
      trustBadges: z.array(z.string()),
      instagram: z.string(),
      website: z.string(),
      customLinks: z.array(z.object({ label: z.string(), url: z.string() })),
      seoTitle: z.string(),
      seoDescription: z.string(),
    })
    .passthrough(),
  logoStyle: z.enum(["letter", "spark", "image"]),
});

const fallbackDraft = (): StorefrontDraft => ({
  config: initialStorefrontConfig,
  logoStyle: "letter",
});

function storageWithLegacyMigration(): Pick<Storage, "getItem"> | undefined {
  if (typeof window === "undefined") return undefined;
  const storage = window.localStorage;
  return {
    getItem(key) {
      const raw = storage.getItem(key);
      if (!raw) return raw;
      try {
        const parsed = JSON.parse(raw) as { version?: unknown };
        if (typeof parsed.version === "number") return raw;
        return JSON.stringify({ version: 1, data: parsed });
      } catch {
        return raw;
      }
    },
  };
}

export function readStorefrontDraft(): StorefrontDraft {
  const parsed = readVersionedStorage({
    key: STOREFRONT_DRAFT_KEY,
    version: 1,
    schema: draftSchema,
    fallback: fallbackDraft,
    storage: storageWithLegacyMigration(),
  });
  return {
    config: { ...initialStorefrontConfig, ...parsed.config } as BuilderConfig,
    logoStyle: parsed.logoStyle,
  };
}

export function writeStorefrontDraft(
  config: BuilderConfig,
  logoStyle: "letter" | "spark" | "image",
): boolean {
  return writeVersionedStorage({
    key: STOREFRONT_DRAFT_KEY,
    version: 1,
    data: { config, logoStyle },
  });
}
