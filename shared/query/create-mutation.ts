import {
  useMutation,
  type MutationKey,
  type UseMutationOptions,
} from "@tanstack/react-query";

type AppMutationOptions<TData, TVariables, TContext = unknown> = Omit<
  UseMutationOptions<TData, Error, TVariables, TContext>,
  "mutationFn"
> & {
  mutationKey: MutationKey;
  mutationFn: (variables: TVariables, signal: AbortSignal) => Promise<TData>;
};

/**
 * Gives every domain mutation an AbortSignal without coupling presentation to
 * mock or HTTP adapters. React Query still owns cache and mutation lifecycle.
 */
export function useAppMutation<TData, TVariables, TContext = unknown>({
  mutationFn,
  ...options
}: AppMutationOptions<TData, TVariables, TContext>) {
  return useMutation({
    ...options,
    mutationFn: async (variables) => {
      const controller = new AbortController();
      return mutationFn(variables, controller.signal);
    },
  });
}
