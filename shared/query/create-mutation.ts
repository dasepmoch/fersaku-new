import {
  useMutation,
  type MutationKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import {
  MUTATION_RETRY,
  createIdempotencyIntentHolder,
  createIdempotencyKey,
  createPendingDedupe,
  isOpaqueIdempotencyKey,
} from "./mutation-policy";

export {
  MUTATION_RETRY,
  createIdempotencyIntentHolder,
  createIdempotencyKey,
  createPendingDedupe,
  isOpaqueIdempotencyKey,
};

type AppMutationOptions<TData, TVariables, TContext = unknown> = Omit<
  UseMutationOptions<TData, Error, TVariables, TContext>,
  "mutationFn" | "retry"
> & {
  mutationKey: MutationKey;
  mutationFn: (variables: TVariables, signal: AbortSignal) => Promise<TData>;
};

/**
 * Domain mutation helper: AbortSignal + hard no-retry.
 * Idempotency keys must be opaque UUIDs from createIdempotencyKey / intent holder
 * (never email/store/amount/PII). Pending CTA dedupe via createPendingDedupe.
 */
export function useAppMutation<TData, TVariables, TContext = unknown>({
  mutationFn,
  ...options
}: AppMutationOptions<TData, TVariables, TContext>) {
  return useMutation({
    ...options,
    retry: MUTATION_RETRY,
    mutationFn: async (variables) => {
      const controller = new AbortController();
      return mutationFn(variables, controller.signal);
    },
  });
}
