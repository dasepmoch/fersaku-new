/**
 * Deterministic client-side pagination math.
 *
 * Keeping this calculation free of React state makes the contract easy to
 * exercise in unit tests and gives future data sources one canonical paging
 * implementation. The hook in `use-client-pagination` intentionally keeps
 * the existing public API and delegates only the calculation here.
 */
export type ClientPaginationResult<T> = {
  pageRows: T[];
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
};

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): ClientPaginationResult<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);

  return {
    pageRows: items.slice(start, end),
    page: safePage,
    pageCount,
    start,
    end,
    total,
  };
}
