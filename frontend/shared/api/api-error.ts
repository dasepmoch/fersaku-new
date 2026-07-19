import type { ApiProblem } from "./contracts";

/**
 * Typed transport error (INT-100).
 * Classify with `classifyThrown` / `classifyApiError` from error-policy (INT-020).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ApiProblem,
    public readonly retryAfterSeconds?: number,
  ) {
    super(problem.message);
    this.name = "ApiError";
  }

  get code(): string {
    return this.problem.code;
  }

  get requestId(): string | undefined {
    return this.problem.requestId;
  }

  get details(): Record<string, unknown> | undefined {
    return this.problem.details;
  }
}
