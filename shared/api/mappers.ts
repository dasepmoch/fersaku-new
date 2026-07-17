/**
 * Shared transport → intermediate helpers (INT-010).
 * Domain mappers live under features/<domain>/mappers.ts and must not import React.
 * Rule authority: TASK/evidence/UI-040/dto-view-parity.md
 */

import { ApiError } from "./api-error";

export type ContractIssue = {
  path: string;
  message: string;
};

/**
 * Fail closed when a mapper cannot produce a safe view model.
 * Diagnostics are redacted (issues only — no raw payload).
 */
export function invalidApiContract(
  message: string,
  options?: {
    requestId?: string;
    issues?: ContractIssue[];
  },
): never {
  throw new ApiError(502, {
    code: "INVALID_API_CONTRACT",
    message,
    requestId: options?.requestId,
    details: options?.issues
      ? { issues: options.issues }
      : undefined,
  });
}

/** Exhaustive enum map helper — unknown values fail closed. */
export function mapExhaustiveEnum<TWire extends string, TView>(
  value: TWire,
  table: Record<TWire, TView>,
  label: string,
): TView {
  if (Object.prototype.hasOwnProperty.call(table, value)) {
    return table[value];
  }
  return invalidApiContract(`Unknown ${label}: ${String(value)}`, {
    issues: [{ path: label, message: `unsupported enum value` }],
  });
}

/** Assert money is already a safe integer (post-schema). */
export function requireSafeMoneyIdr(
  value: number,
  field: string,
): number {
  if (!Number.isSafeInteger(value)) {
    return invalidApiContract(`Invalid money field ${field}`, {
      issues: [{ path: field, message: "must be safe integer IDR" }],
    });
  }
  return value;
}
