"use client";

import type { ClientPagination } from "./use-client-pagination";

function pageCandidates(page: number, pageCount: number) {
  return Array.from(new Set([1, page - 1, page, page + 1, pageCount]))
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
}

export function TablePagination({
  page,
  pageSize,
  total,
  pageCount,
  start,
  end,
  setPage,
  setPageSize,
  pageSizeOptions,
}: ClientPagination) {
  const candidates = pageCandidates(page, pageCount);

  return (
    <div className="auto-table-pagination" aria-label="Table pagination">
      <span className="auto-table-pagination__info">
        {total
          ? `Showing ${start + 1}-${end} of ${total} rows`
          : "No rows to display"}
      </span>
      <div className="auto-table-pagination__actions">
        <label className="auto-table-pagination__size">
          Rows
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage(Math.max(1, page - 1))}
        >
          Previous
        </button>
        <div className="auto-table-pagination__pages">
          {candidates.map((value, index) => {
            const nodes = [];
            if (index > 0 && value - candidates[index - 1] > 1) {
              nodes.push(
                <span key={`ellipsis-${value}`}>...</span>,
              );
            }
            nodes.push(
              <button
                key={value}
                type="button"
                className={value === page ? "is-active" : ""}
                aria-label={`Go to page ${value}`}
                onClick={() => setPage(value)}
              >
                {value}
              </button>,
            );
            return nodes;
          })}
        </div>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => setPage(Math.min(pageCount, page + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
