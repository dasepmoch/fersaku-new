import { test, expect } from "./fixtures";
import { visualRoutes } from "./routes";

test.describe("visual characterization baseline", () => {
  test.describe.configure({ mode: "parallel" });

  for (const route of visualRoutes) {
    test(route, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page).toHaveScreenshot(
        `${route.replaceAll(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "home"}.png`,
        {
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          scale: "css",
        },
      );
    });
  }
});
