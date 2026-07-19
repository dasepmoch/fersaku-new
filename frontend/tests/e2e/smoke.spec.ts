import { test, expect } from "./fixtures";
import { smokeRoutes } from "./routes";

test.describe("route smoke characterization", () => {
  test.describe.configure({ mode: "parallel" });

  for (const route of smokeRoutes) {
    test(route, async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(route, {
        waitUntil: "domcontentloaded",
      });
      expect(response, `${route} did not return a response`).not.toBeNull();
      expect(
        response?.status(),
        `${route} returned an HTTP error`,
      ).toBeLessThan(400);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByRole("main").first()).toBeVisible();
      expect(
        await page.getByRole("heading").count(),
        `${route} should expose a primary heading`,
      ).toBeGreaterThan(0);

      expect(pageErrors, `${route} emitted uncaught exceptions`).toEqual([]);
      expect(consoleErrors, `${route} emitted console errors`).toEqual([]);
    });
  }
});
