import { test, expect } from "./fixtures";

test.describe("critical interaction characterization", () => {
  test("checkout details, QRIS wallet selection, and paid state", async ({
    page,
  }) => {
    await page.goto("/checkout/prod_01", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Nama kamu").fill("Nadia Putri");
    await page.getByPlaceholder("email@kamu.com").fill("nadia@example.test");
    await page.getByRole("button", { name: /Bayar Rp/ }).click();

    await expect(
      page.getByRole("heading", { name: /Pilih e-wallet/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "DANA" }).click();
    await expect(
      page.getByRole("button", { name: "Bayar dengan DANA" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Bayar dengan DANA" }).click();
    await expect(
      page.getByRole("heading", { name: "Pembayaran berhasil!" }),
    ).toBeVisible({
      timeout: 5_000,
    });
  });

  test("storefront undo and redo retain the visible builder workflow", async ({
    page,
  }) => {
    await page.goto("/dashboard/storefront", { waitUntil: "domcontentloaded" });
    const undo = page.locator("button:has(svg.lucide-undo-2)");
    const redo = page.locator("button:has(svg.lucide-redo-2)");
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    await page.getByRole("button", { name: /Signal/ }).click();
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(undo).toBeEnabled();
  });

  test("table pagination changes the visible page", async ({ page }) => {
    await page.goto("/dashboard/orders", { waitUntil: "domcontentloaded" });
    const pagination = page.getByLabel("Table pagination");
    await expect(pagination).toContainText("Showing 1-5");
    await pagination.getByRole("button", { name: "Next" }).click();
    await expect(pagination).toContainText("Showing 6-10");
    await expect(page.getByText("FRS-240712-1808")).toBeVisible();
  });

  test("theme, notification, and profile menus expose their state changes", async ({
    page,
  }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Gunakan mode gelap" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Buka notifikasi" }).click();
    await expect(page.getByText("Tandai semua dibaca")).toBeVisible();
    await page.getByRole("button", { name: "Tandai semua dibaca" }).click();
    await expect(page.getByText("0 belum dibaca")).toBeVisible();

    await page.locator("header button").last().click();
    await expect(page.getByText("Asep Kurnia")).toBeVisible();
    await page.getByRole("button", { name: /Keluar dari sesi/ }).click();
    await expect(
      page.getByRole("link", { name: "Masuk kembali" }),
    ).toBeVisible();
  });

  test("admin confirmation dialog requires the visible action flow", async ({
    page,
  }) => {
    await page.goto("/admin/reviews", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Request buyer edit" })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: /Request edit for/ }),
    ).toBeVisible();
    await page
      .getByPlaceholder("Provide an operational reason...")
      .fill("Review evidence and request buyer correction");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirm action" }).click();
    await expect(
      page.getByRole("heading", { name: "Action recorded" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(
      page.getByRole("heading", { name: "Action recorded" }),
    ).toBeHidden();
  });
});
