import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  STALE_TIME_DEFAULT_MS,
  keepPreviousQueryData,
  staleTimeForSurface,
  type QuerySurface,
  withKeepPreviousData,
} from "./query-policy";

export {
  keepPreviousQueryData,
  staleTimeForSurface,
  withKeepPreviousData,
  type QuerySurface,
};

type AppQueryOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, QueryKey>,
  "queryKey" | "queryFn"
> & {
  queryKey: QueryKey;
  /**
   * Receives React Query's AbortSignal so in-flight GETs cancel on key change
   * / unmount (debounce + filter switch smoothness).
   */
  queryFn: (signal: AbortSignal) => Promise<TData>;
  /**
   * Optional surface for default staleTime when caller does not set staleTime.
   * Defaults to private workspace freshness.
   */
  surface?: QuerySurface;
  /**
   * When true, keep previous data as placeholder while filters/cursor change.
   * Equivalent to placeholderData: keepPreviousData.
   */
  keepPrevious?: boolean;
};

export function useAppQuery<TData>({
  queryKey,
  queryFn,
  surface,
  keepPrevious,
  staleTime,
  placeholderData,
  ...options
}: AppQueryOptions<TData>) {
  const resolvedStale =
    staleTime ??
    (surface ? staleTimeForSurface(surface) : STALE_TIME_DEFAULT_MS);

  const resolvedPlaceholder =
    placeholderData ??
    (keepPrevious ? keepPreviousQueryData : undefined);

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => queryFn(signal),
    staleTime: resolvedStale,
    ...(resolvedPlaceholder !== undefined
      ? { placeholderData: resolvedPlaceholder }
      : {}),
    ...options,
  });
}
