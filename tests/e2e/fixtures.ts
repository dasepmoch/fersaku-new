import { test as base, expect } from "@playwright/test";

/**
 * Keep browser characterization deterministic without changing production
 * runtime behavior. The clock and random source are scoped to each test page;
 * local state is reset before the app boots so one route cannot leak into the
 * next route in the same worker.
 */
export const test = base.extend({
  page: async ({ page }, providePage) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();

      const fixedNow = 1_752_672_000_000;
      Date.now = () => fixedNow;
      Math.random = () => 0.3141592653;
    });

    await providePage(page);
  },
});

export { expect };
