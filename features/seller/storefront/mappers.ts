import { ApiError } from "@/shared/api/api-error";
import { classifyApiError } from "@/shared/api/error-policy";
import { invalidApiContract } from "@/shared/api/mappers";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import type {
  StorefrontPublishDto,
  StorefrontRevisionDto,
  StorefrontStudioDto,
} from "@/shared/api/schemas";
import { initialStorefrontConfig } from "./config";
import type {
  LogoStyle,
  PublishStorefrontResult,
  StorefrontConflictDetails,
  StorefrontRevisionResult,
  StorefrontStudio,
} from "./contracts";
import type { BuilderConfig } from "./types";

const LAYOUTS = new Set(["grid", "editorial", "catalog", "minimal"]);
const HEROES = new Set(["statement", "split", "compact", "spotlight"]);
const CARDS = new Set(["soft", "outline", "poster", "compact"]);
const TEXTURES = new Set(["noise", "grid", "dots", "clean"]);
const RADII = new Set(["round", "soft", "sharp"]);
const FONTS = new Set(["editorial", "modern", "friendly", "mono"]);
const ALIGNS = new Set(["left", "center"]);
const DENSITIES = new Set(["comfortable", "compact"]);
const LOGO_STYLES = new Set(["letter", "spark", "image"]);

const DEFAULT_SECTIONS: BuilderConfig["sections"] = [
  { id: "featured", label: "Produk unggulan", visible: true },
  { id: "products", label: "Semua produk", visible: true },
  { id: "reviews", label: "Ulasan pembeli", visible: true },
  { id: "trust", label: "Trust badges", visible: true },
  { id: "about", label: "Tentang toko", visible: true },
  { id: "newsletter", label: "Newsletter", visible: false },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  if (typeof value === "string" && allowed.has(value)) return value as T;
  return fallback;
}

function mapSections(raw: unknown): BuilderConfig["sections"] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_SECTIONS.map((s) => ({ ...s }));
  }
  const fromIds = new Map(DEFAULT_SECTIONS.map((s) => [s.id, s]));
  const out: BuilderConfig["sections"] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item === "string") {
      if (seen.has(item)) continue;
      seen.add(item);
      const known = fromIds.get(item);
      out.push(
        known
          ? { ...known, visible: true }
          : { id: item, label: item, visible: true },
      );
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = asString(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const known = fromIds.get(id);
    out.push({
      id,
      label: asString(row.label, known?.label ?? id),
      visible: asBoolean(row.visible, true),
    });
  }

  for (const def of DEFAULT_SECTIONS) {
    if (!seen.has(def.id)) {
      out.push({ ...def, visible: false });
    }
  }
  return out.length ? out : DEFAULT_SECTIONS.map((s) => ({ ...s }));
}

function mapFeaturedIds(raw: Record<string, unknown>): string[] {
  const a = raw.featuredIds ?? raw.featuredProductIds;
  if (!Array.isArray(a)) return [];
  return a.filter((x): x is string => typeof x === "string");
}

function mapCustomLinks(raw: unknown): BuilderConfig["customLinks"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = asString(row.label);
      const url = asString(row.url);
      if (!label && !url) return null;
      return { label, url };
    })
    .filter((x): x is { label: string; url: string } => Boolean(x));
}

function mapTrustBadges(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function mapLogoStyle(raw: unknown, fallback: LogoStyle = "letter"): LogoStyle {
  return pickEnum(raw, LOGO_STYLES, fallback);
}

/**
 * Map server draft/published config (public or builder shape) → BuilderConfig.
 * Fail-closed only on non-object; missing fields fall back to initial shell.
 */
export function mapConfigDtoToBuilder(
  raw: unknown,
  base: BuilderConfig = initialStorefrontConfig,
): BuilderConfig {
  const dto = asRecord(raw);
  const socials = asRecord(dto.socials);
  const template =
    asString(dto.template) ||
    asString(dto.preset) ||
    base.template;
  const templateLabel =
    template.length > 0
      ? template.charAt(0).toUpperCase() + template.slice(1)
      : base.template;

  return {
    ...base,
    template: templateLabel,
    name: asString(dto.name, base.name),
    tagline: asString(dto.tagline, base.tagline),
    bio: asString(dto.bio, base.bio),
    announcement: asString(dto.announcement, base.announcement),
    announcementEnabled: asBoolean(
      dto.announcementEnabled,
      base.announcementEnabled,
    ),
    accent: asString(dto.accent, base.accent),
    ink: asString(dto.ink, base.ink),
    canvas: asString(dto.canvas, base.canvas),
    layout: pickEnum(dto.layout, LAYOUTS, base.layout),
    hero: pickEnum(dto.hero, HEROES, base.hero),
    cards: pickEnum(dto.cards, CARDS, base.cards),
    texture: pickEnum(
      dto.texture === "none" ? "clean" : dto.texture,
      TEXTURES,
      base.texture,
    ),
    radius: pickEnum(dto.radius, RADII, base.radius),
    font: pickEnum(dto.font, FONTS, base.font),
    align: pickEnum(
      dto.align ?? dto.headerAlign,
      ALIGNS,
      base.align,
    ),
    density: pickEnum(dto.density, DENSITIES, base.density),
    showSearch: asBoolean(dto.showSearch, base.showSearch),
    showSales: asBoolean(dto.showSales, base.showSales),
    showRatings: asBoolean(dto.showRatings, base.showRatings),
    featuredIds: mapFeaturedIds(dto).length
      ? mapFeaturedIds(dto)
      : base.featuredIds,
    sections: mapSections(dto.sections),
    trustBadges: mapTrustBadges(dto.trustBadges).length
      ? mapTrustBadges(dto.trustBadges)
      : base.trustBadges,
    instagram: asString(
      dto.instagram ?? socials.instagram,
      base.instagram,
    ),
    website: asString(dto.website ?? socials.website, base.website),
    customLinks: mapCustomLinks(dto.customLinks).length
      ? mapCustomLinks(dto.customLinks)
      : base.customLinks,
    seoTitle: asString(dto.seoTitle, base.seoTitle),
    seoDescription: asString(dto.seoDescription, base.seoDescription),
  };
}

export function extractLogoStyle(
  raw: unknown,
  fallback: LogoStyle = "letter",
): LogoStyle {
  const dto = asRecord(raw);
  return mapLogoStyle(dto.logoStyle, fallback);
}

/**
 * Wire body config only — no storeId/logoStyle/reason/idempotency at root.
 * logoStyle is nested so public merge ignores it; builder can restore it.
 */
export function toStorefrontWireConfig(
  config: BuilderConfig,
  logoStyle: LogoStyle,
): Record<string, unknown> {
  return {
    template: config.template,
    preset: config.template.toLowerCase(),
    name: config.name,
    tagline: config.tagline,
    bio: config.bio,
    announcement: config.announcement,
    announcementEnabled: config.announcementEnabled,
    accent: config.accent,
    ink: config.ink,
    canvas: config.canvas,
    layout: config.layout,
    hero: config.hero,
    cards: config.cards,
    texture: config.texture,
    radius: config.radius,
    font: config.font,
    align: config.align,
    headerAlign: config.align,
    density: config.density,
    showSearch: config.showSearch,
    showSales: config.showSales,
    showRatings: config.showRatings,
    featuredIds: [...config.featuredIds],
    featuredProductIds: [...config.featuredIds],
    sections: config.sections.map((s) => ({
      id: s.id,
      label: s.label,
      visible: s.visible,
    })),
    trustBadges: [...config.trustBadges],
    instagram: config.instagram,
    website: config.website,
    socials: {
      instagram: config.instagram,
      website: config.website,
    },
    customLinks: config.customLinks.map((l) => ({
      label: l.label,
      url: l.url,
    })),
    seoTitle: config.seoTitle,
    seoDescription: config.seoDescription,
    logoStyle,
  };
}

export function mapStudioDto(dto: StorefrontStudioDto): StorefrontStudio {
  if (!dto.storeId || typeof dto.draftRevision !== "number" || !dto.draftETag) {
    throw invalidApiContract("storefront.studio missing draft pointers");
  }
  const config = mapConfigDtoToBuilder(dto.draftConfig);
  return {
    storeId: dto.storeId,
    draftRevision: dto.draftRevision,
    draftETag: dto.draftETag,
    config,
    logoStyle: extractLogoStyle(dto.draftConfig),
    publishedRevision:
      typeof dto.publishedRevision === "number" ? dto.publishedRevision : null,
    publishedETag: dto.publishedETag ?? null,
    publishedAt: dto.publishedAt ?? null,
  };
}

export function mapRevisionDto(
  dto: StorefrontRevisionDto,
): StorefrontRevisionResult {
  if (typeof dto.revision !== "number" || !dto.etag) {
    throw invalidApiContract("storefront.revision missing revision/etag");
  }
  const config = mapConfigDtoToBuilder(dto.config);
  return {
    revision: dto.revision,
    etag: dto.etag,
    status: dto.status ?? null,
    config,
    logoStyle: extractLogoStyle(dto.config),
  };
}

export function mapPublishDto(dto: StorefrontPublishDto): PublishStorefrontResult {
  if (typeof dto.accepted !== "boolean" || typeof dto.revision !== "number") {
    throw invalidApiContract("storefront.publish missing accepted/revision");
  }
  if (!dto.requestId) {
    throw invalidApiContract("storefront.publish missing requestId");
  }
  return {
    accepted: dto.accepted,
    revision: dto.revision,
    etag: dto.etag ?? null,
    requestId: dto.requestId,
    storeId: dto.storeId ?? null,
  };
}

export function isStorefrontRevisionConflict(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return (
    classified.kind === "conflict_preserve_draft" ||
    error.problem?.code === PROBLEM_CODES.STOREFRONT_REVISION_CONFLICT
  );
}

export function parseStorefrontConflict(
  error: unknown,
): StorefrontConflictDetails | null {
  if (!(error instanceof ApiError) || !isStorefrontRevisionConflict(error)) {
    return null;
  }
  const details = error.problem?.details ?? {};
  const num = (key: string): number | null => {
    const v = details[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const str = (key: string): string | null => {
    const v = details[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  return {
    currentRevision: num("currentRevision"),
    currentETag: str("currentETag"),
    expectedRevision: num("expectedRevision"),
    expectedETag: str("expectedETag"),
  };
}

/** Status line for existing subtitle node (geometry unchanged). */
export function formatStudioStatusLine(input: {
  revision: number;
  savedAt: number | null;
  conflict: boolean;
  saving: boolean;
  dirty: boolean;
}): string {
  if (input.conflict) {
    return `Revision conflict • revision ${input.revision}`;
  }
  if (input.saving) {
    return `Saving draft… • revision ${input.revision}`;
  }
  if (input.dirty) {
    return `Unsaved changes • revision ${input.revision}`;
  }
  if (input.savedAt) {
    return `Draft autosaved just now • revision ${input.revision}`;
  }
  return `Draft ready • revision ${input.revision}`;
}
