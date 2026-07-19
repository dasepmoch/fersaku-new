/**
 * QLT-200 — FE consumer contract harness.
 *
 * Pattern: raw OpenAPI-shaped DTO fixture → runtime Zod schema → pure mapper → view model.
 * Domain tasks add fixtures/mappers under this harness; do not invent full-matrix coverage here.
 */

import { expect } from "vitest";
import type { z } from "zod";
import { ApiError } from "@/shared/api/api-error";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";

export type ContractMeta = {
  requestId: string;
  timestamp: string;
};

export const FOUNDATION_META: ContractMeta = {
  requestId: "req_qlt200_foundation",
  timestamp: "2026-07-17T12:00:00Z",
};

/** Build SuccessEnvelope matching OpenAPI Meta. */
export function successEnvelope<T>(
  data: T,
  meta: ContractMeta = FOUNDATION_META,
): { data: T; meta: ContractMeta } {
  return { data, meta };
}

/** Build ProblemEnvelope matching OpenAPI ProblemEnvelope. */
export function problemEnvelope(
  problem: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  },
): { problem: typeof problem & { requestId: string } } {
  return {
    problem: {
      ...problem,
      requestId: problem.requestId ?? FOUNDATION_META.requestId,
    },
  };
}

/**
 * Assert schema accepts fixture, then mapper produces expected view (or partial).
 * Fails closed: schema reject or mapper throw is a hard failure unless expectInvalid.
 */
export function assertConsumerMapsToView<TSchema extends z.ZodType, TView>(
  options: {
    name: string;
    schema: TSchema;
    fixture: unknown;
    map: (dto: z.infer<TSchema>) => TView;
    expected: Partial<TView> | ((view: TView) => void);
  },
): TView {
  const parsed = options.schema.safeParse(options.fixture);
  if (!parsed.success) {
    throw new Error(
      `[QLT-200 consumer ${options.name}] schema rejected fixture: ${parsed.error.message}`,
    );
  }
  const view = options.map(parsed.data);
  if (typeof options.expected === "function") {
    options.expected(view);
  } else {
    expect(view).toMatchObject(options.expected as object);
  }
  return view;
}

/** Assert fixture fails schema or mapper with INVALID_API_CONTRACT (fail-closed). */
export function assertConsumerRejects(
  options: {
    name: string;
    schema: z.ZodType;
    fixture: unknown;
    map?: (dto: unknown) => unknown;
    /** When true, schema may pass but mapper must throw INVALID_API_CONTRACT. */
    allowSchemaPass?: boolean;
  },
): void {
  const parsed = options.schema.safeParse(options.fixture);
  if (!parsed.success) {
    expect(parsed.success).toBe(false);
    return;
  }
  if (!options.allowSchemaPass || !options.map) {
    throw new Error(
      `[QLT-200 consumer ${options.name}] expected schema reject, but fixture passed`,
    );
  }
  try {
    options.map(parsed.data);
    throw new Error(
      `[QLT-200 consumer ${options.name}] expected mapper INVALID_API_CONTRACT`,
    );
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    if (error instanceof ApiError) {
      expect(error.problem.code).toBe(PROBLEM_CODES.INVALID_API_CONTRACT);
    }
  }
}

/**
 * Assert request mapper body contains only allowed wire keys (no view-only leakage).
 */
export function assertRequestBodyKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const keys = Object.keys(body).sort();
  const allow = new Set(allowed);
  for (const key of keys) {
    expect(allow.has(key), `unexpected request key: ${key}`).toBe(true);
  }
}

/** Normalize view for mock/API parity compare (drop authority-only fields if needed). */
export function assertNormalizedViewsEqual<T extends object>(
  a: T,
  b: T,
  options?: { omit?: readonly (keyof T)[] },
): void {
  const omit = new Set(options?.omit ?? []);
  const strip = (v: T) => {
    const out = { ...v } as Record<string, unknown>;
    for (const k of omit) delete out[k as string];
    return out;
  };
  expect(strip(a)).toEqual(strip(b));
}
