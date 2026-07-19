/**
 * INT-170 — recursive secret redaction for operator telemetry.
 * Never dump response bodies, cookies, tokens, MFA, bank, inventory secrets.
 */

export const REDACTED = "[REDACTED]" as const;
export const CIRCULAR = "[CIRCULAR]" as const;
export const ERROR_CAUSE_MAX_DEPTH = 6;
export const REDACT_MAX_DEPTH = 12;

/**
 * Key patterns for secrets / PII / high-risk payloads (case-insensitive).
 * Covers: cookie, token, CSRF, MFA, Authorization, API keys, QR, email/phone,
 * bank, signed URL, inventory/delivery secrets, raw/response bodies.
 */
export const SENSITIVE_KEY_PATTERN =
  /email|e_?mail|phone|mobile|msisdn|token|csrf|secret|password|passwd|pwd|credential|authorization|cookie|set-cookie|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|id[_-]?token|session[_-]?id|mfa|otp|totp|\bqr\b|qris|payload|bank|iban|account|routing|signed[_-]?url|presign|download[_-]?url|reveal|inventory|delivery[_-]?secret|raw[_-]?body|response[_-]?body|request[_-]?body/i;

export function isSensitiveKey(key: string): boolean {
  if (!key) return false;
  return SENSITIVE_KEY_PATTERN.test(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function shouldRedactStringValue(key: string, value: string): boolean {
  if (isSensitiveKey(key)) return true;
  if (/^bearer\s+/i.test(value) || /^basic\s+/i.test(value)) return true;
  return false;
}

/**
 * Deep redaction. Handles arrays, plain objects, Error causes, circular refs.
 */
export function redactValue(
  value: unknown,
  key = "",
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (depth > REDACT_MAX_DEPTH) return REDACTED;
  if (key && isSensitiveKey(key)) return REDACTED;

  if (value == null) return value;
  if (typeof value === "string") {
    return shouldRedactStringValue(key, value) ? REDACTED : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return value.toString();

  if (value instanceof Error) {
    return redactError(value, seen, depth);
  }

  if (typeof value !== "object") return value;

  if (seen.has(value)) return CIRCULAR;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      redactValue(item, String(index), seen, depth + 1),
    );
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (!isPlainObject(value)) {
    try {
      const entries = Object.entries(value as object);
      const out: Record<string, unknown> = {};
      for (const [childKey, childValue] of entries) {
        out[childKey] = isSensitiveKey(childKey)
          ? REDACTED
          : redactValue(childValue, childKey, seen, depth + 1);
      }
      return out;
    } catch {
      return REDACTED;
    }
  }

  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    out[childKey] = isSensitiveKey(childKey)
      ? REDACTED
      : redactValue(childValue, childKey, seen, depth + 1);
  }
  return out;
}

/**
 * Redact an Error tree including nested `cause` chains (no raw body dump).
 */
export function redactError(
  error: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): Record<string, unknown> {
  if (depth > ERROR_CAUSE_MAX_DEPTH) {
    return { name: "Error", message: REDACTED, truncated: true };
  }

  if (!(error instanceof Error)) {
    return {
      name: "NonError",
      message:
        typeof error === "string"
          ? shouldRedactStringValue("message", error)
            ? REDACTED
            : error
          : "unknown",
      value: redactValue(error, "value", seen, depth + 1),
    };
  }

  if (seen.has(error)) return { name: error.name, message: CIRCULAR };
  seen.add(error);

  const result: Record<string, unknown> = {
    name: error.name,
    message: redactMessage(error.message),
  };

  const anyErr = error as Error & {
    status?: unknown;
    code?: unknown;
    requestId?: unknown;
    problem?: { code?: unknown; requestId?: unknown; message?: unknown };
  };
  if (typeof anyErr.status === "number") result.status = anyErr.status;
  if (typeof anyErr.code === "string") result.code = anyErr.code;
  if (typeof anyErr.requestId === "string") result.requestId = anyErr.requestId;
  if (anyErr.problem && typeof anyErr.problem === "object") {
    result.problem = {
      code:
        typeof anyErr.problem.code === "string"
          ? anyErr.problem.code
          : undefined,
      requestId:
        typeof anyErr.problem.requestId === "string"
          ? anyErr.problem.requestId
          : undefined,
      message:
        typeof anyErr.problem.message === "string"
          ? redactMessage(anyErr.problem.message)
          : undefined,
    };
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause !== undefined) {
    result.cause = redactError(cause, seen, depth + 1);
  }

  return result;
}

function redactMessage(message: string): string {
  if (!message) return message;
  let out = message;
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]");
  out = out.replace(
    /(password|token|csrf|secret|authorization)\s*[:=]\s*\S+/gi,
    "$1=[REDACTED]",
  );
  out = out.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[REDACTED_EMAIL]",
  );
  return out;
}

export function redactContext(
  context: Record<string, unknown> = {},
): Record<string, unknown> {
  const seen = new WeakSet<object>();
  seen.add(context);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = isSensitiveKey(key)
      ? REDACTED
      : redactValue(value, key, seen, 0);
  }
  return out;
}
