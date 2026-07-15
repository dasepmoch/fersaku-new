import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";

type AppQueryOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, QueryKey>,
  "queryKey" | "queryFn"
> & {
  queryKey: QueryKey;
  queryFn: (signal: AbortSignal) => Promise<TData>;
};

export function useAppQuery<TData>({
  queryKey,
  queryFn,
  ...options
}: AppQueryOptions<TData>) {
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => queryFn(signal),
    ...options,
  });
}

