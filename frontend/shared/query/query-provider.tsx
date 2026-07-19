"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { reportError } from "@/shared/observability/reporter";
import { MUTATION_RETRY } from "./mutation-policy";
import { defaultQueryOptions } from "./query-policy";

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
          queries: { ...defaultQueryOptions },
          mutations: { retry: MUTATION_RETRY },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
