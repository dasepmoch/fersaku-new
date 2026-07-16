"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { reportError } from "@/shared/observability/reporter";

export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) =>
            reportError(error, {
              source: "react-query",
              operation: "query",
              queryDomain: query.queryKey.slice(0, 2).map(String).join("/"),
            }),
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) =>
            reportError(error, {
              source: "react-query",
              operation: "mutation",
              mutationDomain: (mutation.options.mutationKey || [])
                .slice(0, 2)
                .map(String)
                .join("/"),
            }),
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              const status =
                typeof error === "object" && error && "status" in error
                  ? Number(error.status)
                  : 500;
              return status >= 500 && failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
