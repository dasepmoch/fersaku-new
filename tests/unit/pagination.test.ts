import { describe, expect, it } from "vitest";
import { paginate } from "@/shared/ui/pagination";

describe("client pagination math", () => {
  const items = Array.from({ length: 12 }, (_, i) => i + 1);

  it("slices the first page", () => {
    const result = paginate(items, 1, 5);
    expect(result.pageRows).toEqual([1, 2, 3, 4, 5]);
    expect(result.pageCount).toBe(3);
    expect(result.start).toBe(0);
    expect(result.end).toBe(5);
  });

  it("slices the last partial page", () => {
    const result = paginate(items, 3, 5);
    expect(result.pageRows).toEqual([11, 12]);
    expect(result.end).toBe(12);
  });

  it("clamps overflow pages", () => {
    const result = paginate(items, 99, 5);
    expect(result.page).toBe(3);
    expect(result.pageRows).toEqual([11, 12]);
  });

  it("clamps pages below one", () => {
    const result = paginate(items, -4, 5);
    expect(result.page).toBe(1);
    expect(result.pageRows).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles empty collections", () => {
    const result = paginate([], 1, 5);
    expect(result.pageRows).toEqual([]);
    expect(result.pageCount).toBe(1);
    expect(result.total).toBe(0);
  });
});
