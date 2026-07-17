import type { BuilderConfig } from "./types";

export type LogoStyle = "letter" | "spark" | "image";

/** Authoritative studio snapshot from GET /storefront (API mode). */
export type StorefrontStudio = {
  storeId: string;
  draftRevision: number;
  draftETag: string;
  config: BuilderConfig;
  logoStyle: LogoStyle;
  publishedRevision: number | null;
  publishedETag: string | null;
  publishedAt: string | null;
};

export type StorefrontRevisionResult = {
  revision: number;
  etag: string;
  status: "draft" | "published" | null;
  config: BuilderConfig;
  logoStyle: LogoStyle;
};

export type SaveStorefrontDraftInput = {
  storeId: string;
  config: BuilderConfig;
  logoStyle: LogoStyle;
  expectedRevision: number;
  expectedETag: string;
};

export type PublishStorefrontInput = {
  storeId: string;
  config: BuilderConfig;
  logoStyle: LogoStyle;
  expectedRevision: number;
  expectedETag: string;
  reason?: string;
  idempotencyKey?: string;
};

export type PublishStorefrontResult = {
  accepted: boolean;
  revision: number;
  etag: string | null;
  requestId: string;
  storeId: string | null;
};

/** Parsed 409 details for revision recovery (preserve local draft). */
export type StorefrontConflictDetails = {
  currentRevision: number | null;
  currentETag: string | null;
  expectedRevision: number | null;
  expectedETag: string | null;
};
