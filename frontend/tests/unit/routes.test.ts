import { describe, expect, it } from "vitest";
import {
  getAdminPageMeta,
  getAdminSegments,
} from "@/features/admin/config/routes";
import {
  getSellerPageMeta,
  getSellerSegments,
} from "@/features/seller/config/routes";

describe("admin route policy", () => {
  it("parses admin segments", () => {
    expect(getAdminSegments("/admin/merchants/str_01")).toEqual([
      "merchants",
      "str_01",
    ]);
  });

  it("requires explicit permission metadata aligned to backend", () => {
    const meta = getAdminPageMeta(["withdrawals"]);
    expect(meta.permission).toBe("withdrawals.review");
    expect(meta.title).toContain("Withdrawal");
  });
});

describe("seller route policy", () => {
  it("parses seller segments", () => {
    expect(getSellerSegments("/dashboard/products/new")).toEqual([
      "products",
      "new",
    ]);
  });

  it("maps nested product routes", () => {
    const meta = getSellerPageMeta(["products", "prod_01"]);
    expect(meta.title).toBe("Edit produk");
  });
});
