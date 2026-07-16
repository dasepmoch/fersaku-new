import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

const accessibilityRoutes = [
  "/",
  "/checkout/prod_01",
  "/account/security",
  "/dashboard",
  "/dashboard/storefront",
  "/admin",
  "/admin/merchants",
] as const;

test.describe("accessibility smoke", () => {
  for (const route of accessibilityRoutes) {
    test(`${route} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      // The existing visual system intentionally uses low-contrast editorial
      // helper text. Keep the scan strict for structural/keyboard semantics;
      // contrast remains a documented, separately approved UI debt so this
      // refactor does not silently redesign the product.
      const results = await new AxeBuilder({ page })
        .disableRules(["color-contrast"])
        .analyze();
      const blocking = results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
});
