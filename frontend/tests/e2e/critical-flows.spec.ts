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

  test("seller withdrawal uses a verified Xendit quote before submission", async ({
    page,
  }) => {
    await page.goto("/dashboard/balance", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Tarik saldo" }).click();
    await expect(page).toHaveURL(/\/dashboard\/withdrawals\/new$/);
    await expect(
      page.getByText("Storefront • Rp5.000.000", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Verifikasi biaya Xendit" }).click();
    await expect(page.getByText("Rp2.500 • verified")).toBeVisible();
    const submit = page.getByRole("button", { name: "Ajukan penarikan" });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Password akun").fill("mock-pass-123");
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(
      page.getByRole("heading", { name: "Penarikan diajukan." }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Kembali ke riwayat" }).click();
    await expect(page.getByText(/WD-MOCK-/)).toBeVisible();
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
    await page.goto("/admin/reviews", { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Request buyer edit" })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: /Request edit for/ }),
    ).toBeVisible();
    const confirmAction = page.getByRole("button", { name: "Confirm action" });
    await expect(confirmAction).toBeDisabled();
    await page
      .getByPlaceholder("Provide an operational reason...")
      .fill("Review evidence and request buyer correction");
    await expect(confirmAction).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: /I have reviewed the available evidence/,
      })
      .check();
    await expect(confirmAction).toBeEnabled();
    await confirmAction.click();
    await expect(
      page.getByRole("heading", { name: "Action recorded" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Action recorded" }),
    ).toBeHidden();
  });

  test("admin lightweight operations expose guarded source, KYC, and API controls", async ({
    page,
  }) => {
    await page.goto("/admin/payments", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", {
        name: "Provider-paid / local-pending mismatch",
      }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Transaction source" })
      .selectOption("QRIS_API");
    const paymentsTable = page.locator("table");
    await expect(paymentsTable.getByText("qris_2Yc91p")).toBeHidden();
    await expect(paymentsTable.getByText("qris_2Yc88a")).toBeVisible();

    await page.goto("/admin/kyc", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Studio Reka/ }).click();
    const rejectApi = page.getByRole("button", { name: "Reject API" });
    await expect(rejectApi).toBeDisabled();
    await page
      .getByRole("textbox", { name: "Reviewer note" })
      .fill("Identity document needs a clearer resubmission");
    await expect(rejectApi).toBeEnabled();
    await rejectApi.click();
    await expect(
      page.getByRole("heading", {
        name: "Reject Live QRIS API application",
      }),
    ).toBeVisible();
    const confirmKyc = page.getByRole("button", { name: "Confirm action" });
    await expect(confirmKyc).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: /I have reviewed the available evidence/,
      })
      .check();
    await confirmKyc.click();
    await expect(
      page.getByText("Identity document needs a clearer resubmission", {
        exact: true,
      }),
    ).toBeVisible();

    await page.goto("/admin/merchants/str_01H8A2", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Suspend API" }).click();
    await expect(
      page.getByRole("heading", { name: "Suspend QRIS API access" }),
    ).toBeVisible();
    await page
      .getByPlaceholder("Ticket, KYC decision, or operational context...")
      .fill("Support ticket SUP-2048 requests API suspension");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(
      page.getByRole("button", { name: "Restore API" }),
    ).toBeVisible();
  });

  test("admin can open and end a bounded impersonation session as user", async ({
    page,
  }) => {
    await page.goto("/admin/users", { waitUntil: "networkidle" });
    const openAsUser = page
      .getByRole("button", { name: "Open as user" })
      .first();
    await openAsUser.scrollIntoViewIfNeeded();
    await openAsUser.click();
    await expect(
      page.getByRole("heading", { name: "Open as Asep Kurnia" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /Full privileged access/ }),
    ).toHaveCount(0);
    const start = page.getByRole("button", { name: "Start audited session" });
    await expect(start).toBeDisabled();
    await page
      .getByPlaceholder("Ticket, incident, or investigation context...")
      .fill("Support ticket SUP-1234 reproduction");
    await expect(start).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: /Recent administrator MFA re-authentication/,
      })
      .check();
    await expect(start).toBeEnabled();
    await start.click();

    await expect(page).toHaveURL(/\/dashboard\?impersonate=usr_01H8A2/);
    await expect(
      page.getByText(/ADMIN IMPERSONATION.*Asep Kurnia/),
    ).toBeVisible();
    await expect(page.getByText("Read-only session")).toBeVisible();
    const openNavigation = page.getByRole("button", {
      name: "Buka navigasi",
    });
    if (await openNavigation.isVisible()) await openNavigation.click();
    await page.getByRole("link", { name: "Inventory" }).click();
    await expect(page.getByText("Read-only session")).toBeVisible();
    await page.getByRole("button", { name: "Export inventory" }).click();
    await expect(
      page.getByRole("status").filter({
        hasText: "Aksi diblokir: sesi impersonation ini hanya-baca.",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByText(/ADMIN IMPERSONATION/)).toBeHidden();
  });

  test("expired impersonation is cleared and redirected before seller access", async ({
    page,
  }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      sessionStorage.setItem(
        "fersaku-impersonation-session-v1",
        JSON.stringify({
          version: 1,
          sessionId: "expired_session_01",
          targetId: "usr_expired",
          targetName: "Expired User",
          targetType: "user",
          scope: "read-only",
          reason: "Expired support investigation",
          ttlMinutes: 15,
          startedAt: new Date(Date.now() - 16 * 60_000).toISOString(),
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
          actor: "admin@fersaku.id",
        }),
      );
      window.history.replaceState(
        null,
        "",
        "/dashboard?impersonate=usr_expired&session=expired_session_01",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.dispatchEvent(new Event("fersaku-impersonation-updated"));
    });
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByText(/ADMIN IMPERSONATION/)).toBeHidden();
    await expect(
      page.evaluate(() =>
        sessionStorage.getItem("fersaku-impersonation-session-v1"),
      ),
    ).resolves.toBeNull();
  });

  test("admin finance and callback controls expose guarded modal states", async ({
    page,
  }) => {
    await page.goto("/admin/system", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("textbox", { name: "Platform fee %" }),
    ).not.toBeEditable();
    await expect(
      page.getByRole("textbox", { name: "Payment processing fee Rp" }),
    ).not.toBeEditable();
    await page.getByRole("button", { name: "Preview calculation" }).click();
    await expect(
      page.getByRole("heading", { name: "Preview fee calculation" }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Calculation type" })
      .selectOption("withdrawal");
    await page.getByRole("textbox", { name: "Gross amount" }).fill("49000");
    await expect(
      page.getByText(/Minimum withdrawal is Rp\s?50\.000/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close fee preview" }).click();
    await expect(
      page.getByRole("button", { name: "Publish current configuration" }),
    ).toBeDisabled();

    await page.goto("/admin/webhooks", { waitUntil: "networkidle" });
    const sellerDelivery = page
      .locator("tbody tr")
      .filter({ hasText: "Seller" })
      .first();
    await sellerDelivery.click();
    const retrySellerDelivery = page.getByRole("button", {
      name: "Retry seller delivery",
    });
    await expect(retrySellerDelivery).toBeEnabled();
    await retrySellerDelivery.click();
    await expect(
      page.getByRole("heading", { name: /Retry seller delivery/ }),
    ).toBeVisible();
    await page
      .getByPlaceholder("Provide an operational reason...")
      .fill("Retry signed seller delivery after endpoint recovery");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirm action" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(sellerDelivery.getByText("DELIVERED")).toBeVisible();

    const mismatchCallback = page
      .locator("tbody tr")
      .filter({ hasText: "whd_9244" });
    await mismatchCallback.click();
    const forceFulfill = page.getByRole("button", { name: "Force-Fulfill" });
    await expect(forceFulfill).toBeEnabled();
    await forceFulfill.click();
    await expect(
      page.getByRole("textbox", { name: "Verified provider reference" }),
    ).toHaveValue("XND-QRP-99281");
    await expect(page.getByText("provider_XND_99281.pdf")).toBeVisible();
    await page
      .getByPlaceholder(
        "Explain callback checks and why manual fulfillment is safe...",
      )
      .fill("Bound provider evidence confirms safe fulfillment replay");
    const forceDialog = page.getByRole("dialog");
    await forceDialog.getByRole("checkbox").first().check();
    await forceDialog.getByRole("checkbox").nth(1).check();
    await page
      .getByRole("button", { name: "Queue verified fulfillment" })
      .click();
    await expect(mismatchCallback.getByText("Fulfilled")).toBeVisible();

    const confirmCallbackRetry = async (reason: string) => {
      await expect(
        page.getByRole("heading", { name: /Retry Xendit callback/ }),
      ).toBeVisible();
      const confirm = page.getByRole("button", { name: "Confirm action" });
      await expect(confirm).toBeDisabled();
      await page
        .getByPlaceholder("Provide an operational reason...")
        .fill(reason);
      await page.getByRole("checkbox").check();
      await confirm.click();
      await expect(
        page.getByRole("heading", { name: "Action recorded" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close", exact: true }).click();
    };

    await page
      .getByRole("button", { name: /Retry callback/ })
      .first()
      .click();
    await confirmCallbackRetry(
      "Retry signed Xendit callback after provider timeout",
    );
    await expect(page.getByText("1 open", { exact: true })).toBeVisible({
      timeout: 5_000,
    });
    await page
      .getByRole("button", { name: /Retry callback/ })
      .first()
      .click();
    await confirmCallbackRetry(
      "Retry signed Xendit callback after signature review",
    );
    await expect(
      page.getByText(
        "All Xendit callbacks have a successful delivery response.",
      ),
    ).toBeVisible({ timeout: 5_000 });

    await page.goto("/admin/audit-logs", { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /Inspect audit event/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Immutable event inspector" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Verify integrity" }).click();
    await expect(page.getByText("Hash verified")).toBeVisible();
    await page.getByRole("button", { name: "Close event inspector" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^fersaku-audit-.*\.csv$/);

    await page.evaluate(() => {
      const key = "fersaku-admin-audit-events";
      const raw = localStorage.getItem(key);
      if (!raw) throw new Error("Expected a stored mock audit event");
      const parsed = JSON.parse(raw) as {
        version: number;
        data: Array<Record<string, unknown>>;
      };
      parsed.data[0] = { ...parsed.data[0], context: "tampered" };
      localStorage.setItem(key, JSON.stringify(parsed));
      window.dispatchEvent(new Event("fersaku-admin-audit-updated"));
    });
    await expect(page.getByText(/chain invalid/)).toBeVisible();
    await page
      .getByRole("button", { name: /Inspect audit event/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Verify integrity" }).click();
    await expect(page.getByText("Hash invalid")).toBeVisible();
    await page.getByRole("button", { name: "Close event inspector" }).click();
  });

  test("admin emergency and fulfillment mutations stay guarded and stateful", async ({
    page,
  }) => {
    await page.goto("/admin/providers", { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Pause Seller registration" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Pause Seller registration" }),
    ).toBeVisible();
    const emergencyConfirm = page.getByRole("button", {
      name: "Confirm & audit change",
    });
    await expect(emergencyConfirm).toBeDisabled();
    await page
      .getByPlaceholder(
        "Incident ID, provider notice, impact, and rollback condition...",
      )
      .fill("Incident INC-2048 temporarily pauses seller onboarding");
    await page.getByRole("checkbox").check();
    await emergencyConfirm.click();
    const registrationControl = page
      .getByText("Seller registration", { exact: true })
      .locator("..");
    await expect(registrationControl.getByText("PAUSED")).toBeVisible();

    await page
      .getByRole("button", { name: "Disable global maintenance banner" })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Disable global maintenance banner",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm & audit change" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.goto("/admin/fulfillment", { waitUntil: "networkidle" });
    const failedDelivery = page
      .getByRole("row")
      .filter({ hasText: "dlv_92836" });
    await page
      .getByRole("button", { name: "Inspect delivery dlv_92836" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Inspect delivery dlv_92836" }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Provide an operational reason..."),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await page
      .getByRole("button", { name: "Retry fulfillment dlv_92836" })
      .click();
    await expect(
      failedDelivery.getByText("Failed", { exact: true }),
    ).toBeVisible();
    await page
      .getByPlaceholder("Provide an operational reason...")
      .fill("Retry delivery after verified transient worker failure");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirm action" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      failedDelivery.getByText("Fulfilled", { exact: true }),
    ).toBeVisible();
    await expect(failedDelivery.getByText("4", { exact: true })).toBeVisible();

    const fulfilledDelivery = page
      .getByRole("row")
      .filter({ hasText: "dlv_92841" });
    await page
      .getByRole("button", { name: "Revoke delivery dlv_92841" })
      .click();
    await expect(
      fulfilledDelivery.getByText("Fulfilled", { exact: true }),
    ).toBeVisible();
    await page
      .getByPlaceholder("Provide an operational reason...")
      .fill("Revoke compromised delivery link after support verification");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirm action" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      fulfilledDelivery.getByText("Revoked", { exact: true }),
    ).toBeVisible();

    await page.goto("/admin/inventory", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: "Privileged reveal" }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reveal", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: /Reveal stock item/ }),
    ).toBeVisible();
    await page
      .getByPlaceholder("Provide an operational reason...")
      .fill("Support ticket SUP-7712 requires one credential check");
    const revealDialog = page.getByRole("dialog");
    await revealDialog.getByRole("checkbox").first().check();
    await revealDialog.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: "Confirm action" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText(/Cnv#8K2A1/)).toBeVisible();
    await page.getByRole("button", { name: "Hide" }).click();
    await expect(page.getByText(/Cnv#8K2A1/)).toBeHidden();
  });
});
