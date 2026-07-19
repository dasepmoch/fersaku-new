import type { ZodType } from "zod";

export type VersionedPayload<T> = {
  version: number;
  data: T;
};

type ReadVersionedOptions<T> = {
  key: string;
  version: number;
  schema: ZodType<T>;
  fallback: () => T;
  migrate?: (payload: unknown, fromVersion: number) => T | null;
  storage?: Pick<Storage, "getItem">;
};

type WriteVersionedOptions<T> = {
  key: string;
  version: number;
  data: T;
  storage?: Pick<Storage, "setItem">;
};

function browserStorage() {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function readVersionedStorage<T>({
  key,
  version,
  schema,
  fallback,
  migrate,
  storage = browserStorage(),
}: ReadVersionedOptions<T>): T {
  if (!storage) return fallback();
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback();
    const payload = JSON.parse(raw) as unknown;
    if (!payload || typeof payload !== "object") return fallback();

    const envelope = payload as Partial<VersionedPayload<unknown>>;
    if (envelope.version === version) {
      const parsed = schema.safeParse(envelope.data);
      return parsed.success ? parsed.data : fallback();
    }

    if (typeof envelope.version === "number" && migrate) {
      const migrated = migrate(envelope.data, envelope.version);
      if (migrated !== null) {
        const parsed = schema.safeParse(migrated);
        if (parsed.success) return parsed.data;
      }
    }
    return fallback();
  } catch {
    return fallback();
  }
}

export function writeVersionedStorage<T>({
  key,
  version,
  data,
  storage = browserStorage(),
}: WriteVersionedOptions<T>): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ version, data }));
    return true;
  } catch {
    return false;
  }
}
