/**
 * INT-020 list pagination semantics.
 * CursorList: infinite/prev-next (no total/page jump).
 * NumberedPageList: TablePagination (page/pageSize/totalCount/pageCount).
 */

import type {
  CursorListEnvelope,
  CursorListMeta,
  NumberedPageListEnvelope,
  NumberedPageListMeta,
} from "./contracts";

export type PaginationProfile = "cursor" | "numbered";

/** Props shape consumed by existing TablePagination (no visual change). */
export type TablePaginationView = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  start: number;
  end: number;
};

export type NumberedPageQuery = {
  page: number;
  pageSize: number;
};

export type CursorPageQuery = {
  cursor?: string | null;
  limit?: number;
};

/**
 * Map OpenAPI NumberedPageListMeta → TablePagination display fields.
 * Does not invent totals from client-side history.
 */
export function numberedMetaToTablePagination(
  meta: Pick<
    NumberedPageListMeta,
    "page" | "pageSize" | "totalCount" | "pageCount"
  >,
): TablePaginationView {
  const page = Math.max(1, meta.page);
  const pageSize = Math.max(1, meta.pageSize);
  const total = Math.max(0, meta.totalCount);
  const pageCount =
    meta.pageCount > 0
      ? meta.pageCount
      : Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize;
  const end = total === 0 ? 0 : Math.min(start + pageSize, total);

  return {
    page: safePage,
    pageSize,
    total,
    pageCount,
    start,
    end,
  };
}

/**
 * Build TablePaginationView from a full NumberedPageList envelope.
 * Row count is authoritative from meta.totalCount, not data.length alone.
 */
export function numberedEnvelopeToTablePagination<T>(
  envelope: NumberedPageListEnvelope<T>,
): TablePaginationView & { rows: T[] } {
  return {
    ...numberedMetaToTablePagination(envelope.meta),
    rows: envelope.data,
  };
}

/** Normalize query params for numbered-page endpoints. */
export function buildNumberedPageQuery(
  page: number,
  pageSize: number,
): NumberedPageQuery {
  return {
    page: Math.max(1, Math.floor(page) || 1),
    pageSize: Math.max(1, Math.floor(pageSize) || 1),
  };
}

/** Cursor query: opaque cursor only; filter/sort changes invalidate cursor. */
export function buildCursorPageQuery(
  cursor?: string | null,
  limit?: number,
): CursorPageQuery {
  const query: CursorPageQuery = {};
  if (cursor) query.cursor = cursor;
  if (limit !== undefined && limit !== null) {
    query.limit = Math.max(1, Math.floor(limit) || 1);
  }
  return query;
}

export function cursorHasMore(meta: CursorListMeta): boolean {
  return Boolean(meta.hasMore);
}

export function cursorNext(meta: CursorListMeta): string | null {
  if (!meta.hasMore) return null;
  return meta.nextCursor ?? null;
}

export function cursorPrevious(meta: CursorListMeta): string | null {
  return meta.previousCursor ?? null;
}

/**
 * Cursor lists must not claim total/page jump.
 * Use for infinite scroll / prev-next only.
 */
export function assertCursorProfile(
  meta: CursorListMeta,
): asserts meta is CursorListMeta {
  if (typeof meta.hasMore !== "boolean") {
    throw new Error("CursorListMeta requires hasMore");
  }
}

/**
 * Numbered lists require authoritative totals for TablePagination.
 */
export function assertNumberedProfile(
  meta: NumberedPageListMeta,
): asserts meta is NumberedPageListMeta {
  if (
    typeof meta.page !== "number" ||
    typeof meta.pageSize !== "number" ||
    typeof meta.totalCount !== "number" ||
    typeof meta.pageCount !== "number"
  ) {
    throw new Error(
      "NumberedPageListMeta requires page/pageSize/totalCount/pageCount",
    );
  }
}

/** Detect which list meta profile a meta object implements. */
export function detectPaginationProfile(
  meta: Record<string, unknown>,
): PaginationProfile | null {
  if (
    typeof meta.page === "number" &&
    typeof meta.pageSize === "number" &&
    typeof meta.totalCount === "number" &&
    typeof meta.pageCount === "number"
  ) {
    return "numbered";
  }
  if (typeof meta.hasMore === "boolean") {
    return "cursor";
  }
  return null;
}

/**
 * Showing X–Y of N copy inputs for existing TablePagination info string.
 * Visual component unchanged — callers pass these props through.
 */
export function tablePaginationShowingLabel(view: TablePaginationView): string {
  if (!view.total) return "No rows to display";
  return `Showing ${view.start + 1}-${view.end} of ${view.total} rows`;
}

export type { CursorListEnvelope, NumberedPageListEnvelope };
