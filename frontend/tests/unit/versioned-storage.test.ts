import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  readVersionedStorage,
  writeVersionedStorage,
} from "@/shared/storage/versioned-storage";

const schema = z.object({ name: z.string(), count: z.number() });
const fallback = () => ({ name: "fallback", count: 0 });

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe("versioned storage adapter", () => {
  it("round-trips a versioned, schema-validated payload", () => {
    const storage = memoryStorage();
    expect(
      writeVersionedStorage({
        key: "draft",
        version: 2,
        data: { name: "saved", count: 3 },
        storage,
      }),
    ).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      "draft",
      JSON.stringify({ version: 2, data: { name: "saved", count: 3 } }),
    );
    expect(
      readVersionedStorage({
        key: "draft",
        version: 2,
        schema,
        fallback,
        storage,
      }),
    ).toEqual({ name: "saved", count: 3 });
  });

  it("falls back for missing, malformed, and schema-invalid data", () => {
    const missing = memoryStorage();
    expect(
      readVersionedStorage({
        key: "draft",
        version: 1,
        schema,
        fallback,
        storage: missing,
      }),
    ).toEqual(fallback());

    const malformed = memoryStorage({ draft: "not-json" });
    expect(
      readVersionedStorage({
        key: "draft",
        version: 1,
        schema,
        fallback,
        storage: malformed,
      }),
    ).toEqual(fallback());

    const invalid = memoryStorage({
      draft: JSON.stringify({ version: 1, data: { name: 42, count: "3" } }),
    });
    expect(
      readVersionedStorage({
        key: "draft",
        version: 1,
        schema,
        fallback,
        storage: invalid,
      }),
    ).toEqual(fallback());
  });

  it("migrates older versions only when the migrated value validates", () => {
    const old = memoryStorage({
      draft: JSON.stringify({ version: 1, data: { label: "legacy" } }),
    });
    const migrate = vi.fn((data: unknown, fromVersion: number) => {
      expect(fromVersion).toBe(1);
      return { name: (data as { label: string }).label, count: 1 };
    });
    expect(
      readVersionedStorage({
        key: "draft",
        version: 2,
        schema,
        fallback,
        migrate,
        storage: old,
      }),
    ).toEqual({ name: "legacy", count: 1 });
    expect(migrate).toHaveBeenCalledOnce();

    const invalidMigration = memoryStorage({
      draft: JSON.stringify({ version: 1, data: { label: "legacy" } }),
    });
    expect(
      readVersionedStorage({
        key: "draft",
        version: 2,
        schema,
        fallback,
        migrate: () => null,
        storage: invalidMigration,
      }),
    ).toEqual(fallback());
  });

  it("handles unavailable and throwing storage without crashing the UI", () => {
    expect(
      readVersionedStorage({
        key: "draft",
        version: 1,
        schema,
        fallback,
        storage: undefined,
      }),
    ).toEqual(fallback());
    expect(
      writeVersionedStorage({
        key: "draft",
        version: 1,
        data: { name: "x", count: 1 },
        storage: undefined,
      }),
    ).toBe(false);

    const throwing = {
      getItem: vi.fn(() => {
        throw new Error("quota");
      }),
      setItem: vi.fn(() => {
        throw new Error("quota");
      }),
    };
    expect(
      readVersionedStorage({
        key: "draft",
        version: 1,
        schema,
        fallback,
        storage: throwing,
      }),
    ).toEqual(fallback());
    expect(
      writeVersionedStorage({
        key: "draft",
        version: 1,
        data: { name: "x", count: 1 },
        storage: throwing,
      }),
    ).toBe(false);
  });
});
