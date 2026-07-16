"use client";

import { useMemo, useState } from "react";
import { paginate } from "./pagination";

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
  const pageResult = useMemo(
    () => paginate(items, page, pageSize),
    [items, page, pageSize],
  );
  const { page: safePage, pageCount, start, end, total, pageRows } = pageResult;

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
