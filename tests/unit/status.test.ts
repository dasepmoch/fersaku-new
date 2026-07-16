import { describe, expect, it } from "vitest";
import { isPendingStatus, isPositiveStatus } from "@/shared/format/status";

describe("status helpers", () => {
  it("classifies positive statuses", () => {
    expect(isPositiveStatus("Active")).toBe(true);
    expect(isPositiveStatus("Paid")).toBe(true);
    expect(isPositiveStatus("Completed")).toBe(true);
    expect(isPositiveStatus("Verified")).toBe(true);
    expect(isPositiveStatus("Published")).toBe(true);
  });

  it("classifies pending statuses", () => {
    expect(isPendingStatus("Pending")).toBe(true);
    expect(isPendingStatus("Processing")).toBe(true);
    expect(isPendingStatus("On hold")).toBe(true);
    expect(isPendingStatus("Review")).toBe(true);
  });

  it("returns false for negative or unknown statuses", () => {
    expect(isPositiveStatus("Failed")).toBe(false);
    expect(isPendingStatus("Failed")).toBe(false);
    expect(isPositiveStatus("Suspended")).toBe(false);
    expect(isPendingStatus("Suspended")).toBe(false);
    expect(isPositiveStatus("Unknown")).toBe(false);
    expect(isPendingStatus("Unknown")).toBe(false);
  });
});
