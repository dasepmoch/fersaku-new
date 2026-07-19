/**
 * Shared transport contracts (wire layer).
 * View models remain in features/<domain>/contracts.ts — do not merge them here.
 * OpenAPI-generated DTO aliases: shared/api/generated.
 *
 * INT-020 policy modules (import from these for behavior, not only types):
 * - problem-codes.ts — stable problem catalog
 * - error-policy.ts — HTTP/problem classification + FE mapping
 * - pagination.ts — CursorList vs NumberedPageList helpers
 * - idempotency.ts — UUID-per-intent key policy
 * - http-semantics.ts — success statuses, If-Match, no-store, /v1
 */

export type ApiRequestMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiEnvelope<T> = {
  data: T;
  meta: ApiRequestMeta;
};

/** OpenAPI CursorListMeta (wire). Prefer this over CursorPage for live lists. */
export type CursorListMeta = {
  requestId: string;
  timestamp: string;
  nextCursor?: string | null;
  previousCursor?: string | null;
  hasMore: boolean;
};

export type NumberedPageListMeta = {
  requestId: string;
  timestamp: string;
  page: number;
  pageSize: number;
  totalCount: number;
  pageCount: number;
};

export type CursorListEnvelope<T> = {
  data: T[];
  meta: CursorListMeta;
};

export type NumberedPageListEnvelope<T> = {
  data: T[];
  meta: NumberedPageListMeta;
};

/**
 * Legacy adapter page shape (`items` + cursors) used by some mock paths.
 * Live OpenAPI CursorList uses `data` + CursorListMeta — map via feature mappers.
 */
export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
};

/** Nested problem object (inside ProblemEnvelope.problem). */
export type ApiProblem = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
};

/** Wire problem envelope matching OpenAPI ProblemEnvelope. */
export type ProblemEnvelope = {
  problem: {
    code: string;
    message: string;
    details?: Record<string, unknown> & {
      fields?: Array<{ field: string; code: string; message?: string }>;
    };
    requestId: string;
  };
};

export type FieldViolation = {
  field: string;
  code: string;
  message?: string;
};
