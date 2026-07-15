"use client";

import { useMemo, useState } from "react";

export type ClientPagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  start: number;
  end: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  pageSizeOptions: number[];
};

const DEFAULT_PAGE_SIZES = [5, 10, 25, 50] as const;

export function useClientPagination<T>(
  items: readonly T[],
  initialPageSize = 5,
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);

  const pageRows = useMemo(
    () => items.slice(start, end),
    [items, start, end],
  );

  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
  };

  const pagination: ClientPagination = {
    page: safePage,
    pageSize,
    total,
    pageCount,
    start,
    end,
    setPage,
    setPageSize,
    pageSizeOptions: [...DEFAULT_PAGE_SIZES],
  };

  return { pageRows, pagination };
}
