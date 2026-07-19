import { describe, expect, it } from "vitest";
import { formatLedgerDate } from "@/shared/format/date";
import { formatSignedRupiah, rupiah } from "@/shared/format/money";
import { compactRupiah } from "@/lib/utils";

describe("money formatters", () => {
  it("formats IDR without non-breaking spaces", () => {
    expect(rupiah(18_240_500)).toBe("Rp18.240.500");
    expect(rupiah(76_630)).toBe("Rp76.630");
    expect(rupiah(18_240_500).includes("\u00a0")).toBe(false);
  });

  it("formats signed ledger amounts", () => {
    expect(formatSignedRupiah(76_630, "CREDIT")).toBe("+ Rp76.630");
    expect(formatSignedRupiah(5_000_000, "DEBIT")).toBe("- Rp5.000.000");
  });

  it("compacts large amounts", () => {
    expect(compactRupiah(7_000_000)).toBe("Rp7jt");
  });
});

describe("date formatters", () => {
  it("formats ledger timestamps without runtime timezone drift", () => {
    expect(formatLedgerDate("2026-07-12T14:32:00+07:00")).toBe("12 Jul, 14:32");
    expect(formatLedgerDate("2026-07-11T09:10:00+07:00")).toBe("11 Jul, 09:10");
  });
});
