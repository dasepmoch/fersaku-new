"use client";

import Link from "next/link";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileDown,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  PackageCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BuyerPurchase } from "@/features/buyer/data";
import {
  accessBuyerDelivery,
  DELIVERY_SECRET_MEMORY_TTL_MS,
  extractOpenUrlFromClaim,
  isBuyerDeliveryApiDomain,
  isDeliveryClaimExpired,
  resendBuyerDelivery,
  secretsToCodeValue,
  secretsToCredentialFields,
  type DeliveryAccessClaim,
} from "@/features/commerce/delivery-access";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import { getDomainSource } from "@/shared/data/domain-source";
import { rupiah } from "@/lib/utils";
import { ProductArt } from "@/components/product-art";
import { BuyerReviewCard } from "./pieces";

const card = "rounded-[24px] border hairline bg-white shadow-card";

function accessOrderKey(purchase: BuyerPurchase): string {
  return purchase.internalOrderId || purchase.orderId;
}

export function PurchaseDetail({ purchase }: { purchase: BuyerPurchase }) {
  const orderBoundary = `${purchase.internalOrderId ?? ""}:${purchase.orderId}`;
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState("");
  /**
   * BUY-110 version-update disposition: DISABLED until canonical BE command.
   * Mock may still toggle local display; api never setUpdated(true) as success.
   */
  const [updated, setUpdated] = useState(false);
  const versionUpdateEnabled =
    getDomainSource("buyer") === "mock" &&
    Boolean(purchase.updateAvailable && purchase.sellerUpdatesEnabled);
  const [accessBusy, setAccessBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [accessError, setAccessError] = useState(false);
  /** Session UI + secrets keyed by order so switch drops without effect setState. */
  const [session, setSession] = useState<{
    key: string;
    credentials: Array<{ label: string; value: string; secret?: boolean }> | null;
    code: string | null;
    downloaded: boolean;
    resendDone: boolean;
  }>({
    key: orderBoundary,
    credentials: null,
    code: null,
    downloaded: false,
    resendDone: false,
  });
  /** Claim held off-render; orderId on claim must match current access key. */
  const claimRef = useRef<DeliveryAccessClaim | null>(null);
  const resendIdemRef = useRef<string | null>(null);

  const liveCredentials =
    session.key === orderBoundary ? session.credentials : null;
  const liveCode = session.key === orderBoundary ? session.code : null;
  const effectiveDownloaded =
    session.key === orderBoundary ? session.downloaded : false;
  const effectiveResendDone =
    session.key === orderBoundary ? session.resendDone : false;

  const clearSecrets = useCallback(() => {
    claimRef.current = null;
    resendIdemRef.current = null;
    setSession({
      key: orderBoundary,
      credentials: null,
      code: null,
      downloaded: false,
      resendDone: false,
    });
    setRevealed({});
  }, [orderBoundary]);

  useEffect(() => {
    return () => {
      claimRef.current = null;
      resendIdemRef.current = null;
    };
  }, [orderBoundary]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      const c = claimRef.current;
      if (
        c &&
        isDeliveryClaimExpired(c, Date.now(), DELIVERY_SECRET_MEMORY_TTL_MS)
      ) {
        clearSecrets();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [clearSecrets]);

  const copy = (value: string, label: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1600);
  };

  const currentClaim = (): DeliveryAccessClaim | null => {
    const c = claimRef.current;
    if (!c) return null;
    const orderKey = accessOrderKey(purchase);
    if (c.orderId !== orderKey && c.orderId !== purchase.orderId) {
      claimRef.current = null;
      return null;
    }
    return c;
  };

  const claimAccess = async (): Promise<DeliveryAccessClaim | null> => {
    const orderKey = accessOrderKey(purchase);
    if (getDomainSource("buyer") === "mock") {
      // Mock fixtures may already carry display values; mark claimed without network.
      const mockClaim: DeliveryAccessClaim = {
        grantId: `mock_${orderKey}`,
        orderId: orderKey,
        orderItemId: "mock_item",
        deliveryKind:
          purchase.deliveryType === "download"
            ? "DOWNLOAD"
            : purchase.deliveryType === "link"
              ? "PROTECTED_LINK"
              : purchase.deliveryType === "credentials"
                ? "CREDENTIAL"
                : "CODE",
        status: "ACTIVE",
        accessCount: 1,
        maxAccesses: 5,
        claimedAtMs: Date.now(),
        secrets:
          purchase.deliveryType === "code" && purchase.code?.value
            ? { code: purchase.code.value }
            : purchase.deliveryType === "credentials" &&
                purchase.credentialFields?.length
              ? Object.fromEntries(
                  purchase.credentialFields.map((f) => [
                    f.label.toLowerCase(),
                    f.value,
                  ]),
                )
              : undefined,
        downloadObjectId:
          purchase.deliveryType === "download"
            ? `obj_mock_${orderKey}`
            : undefined,
      };
      claimRef.current = mockClaim;
      const mockSecrets = mockClaim.secrets;
      if (mockSecrets) {
        setSession((prev) => ({
          key: orderBoundary,
          credentials:
            purchase.deliveryType === "credentials"
              ? secretsToCredentialFields(mockSecrets)
              : null,
          code:
            purchase.deliveryType === "code"
              ? secretsToCodeValue(mockSecrets)
              : null,
          downloaded: prev.key === orderBoundary ? prev.downloaded : false,
          resendDone: prev.key === orderBoundary ? prev.resendDone : false,
        }));
      }
      return mockClaim;
    }

    if (!isBuyerDeliveryApiDomain()) {
      setAccessError(true);
      return null;
    }

    setAccessBusy(true);
    setAccessError(false);
    try {
      const claim = await accessBuyerDelivery(orderKey);
      if (!claim) {
        setAccessError(true);
        return null;
      }
      claimRef.current = claim;
      const secrets = claim.secrets;
      if (secrets) {
        setSession((prev) => ({
          key: orderBoundary,
          credentials:
            claim.deliveryKind === "CREDENTIAL" ||
            purchase.deliveryType === "credentials"
              ? secretsToCredentialFields(secrets)
              : null,
          code:
            claim.deliveryKind === "CODE" || purchase.deliveryType === "code"
              ? secretsToCodeValue(secrets)
              : null,
          downloaded: prev.key === orderBoundary ? prev.downloaded : false,
          resendDone: prev.key === orderBoundary ? prev.resendDone : false,
        }));
      }
      return claim;
    } catch {
      setAccessError(true);
      return null;
    } finally {
      setAccessBusy(false);
    }
  };

  const onDownload = async () => {
    if (accessBusy || effectiveDownloaded) return;
    const claim = currentClaim() ?? (await claimAccess());
    if (!claim) return;
    const openUrl = extractOpenUrlFromClaim(claim);
    if (openUrl) {
      window.open(openUrl, "_blank", "noopener,noreferrer");
    }
    // downloadObjectId only: claim recorded; signed URL exchange not mounted.
    setSession((prev) => ({
      key: orderBoundary,
      credentials: prev.key === orderBoundary ? prev.credentials : null,
      code: prev.key === orderBoundary ? prev.code : null,
      downloaded: true,
      resendDone: prev.key === orderBoundary ? prev.resendDone : false,
    }));
  };

  const onOpenProtectedLink = async () => {
    if (accessBusy) return;
    const claim = currentClaim() ?? (await claimAccess());
    if (!claim) return;
    const openUrl = extractOpenUrlFromClaim(claim);
    if (openUrl) {
      window.open(openUrl, "_blank", "noopener,noreferrer");
    }
  };

  const onRevealCredentials = async () => {
    if (liveCredentials?.length) return;
    await claimAccess();
  };

  const onRevealCode = async () => {
    if (liveCode) return;
    await claimAccess();
  };

  const onResend = async () => {
    if (resendBusy || effectiveResendDone) return;
    const orderKey = accessOrderKey(purchase);

    if (getDomainSource("buyer") === "mock") {
      setSession((prev) => ({
        key: orderBoundary,
        credentials: prev.key === orderBoundary ? prev.credentials : null,
        code: prev.key === orderBoundary ? prev.code : null,
        downloaded: prev.key === orderBoundary ? prev.downloaded : false,
        resendDone: true,
      }));
      return;
    }
    if (!isBuyerDeliveryApiDomain()) return;

    if (!resendIdemRef.current) {
      resendIdemRef.current = createIdempotencyKey();
    }
    setResendBusy(true);
    try {
      await resendBuyerDelivery({
        orderId: orderKey,
        idempotencyKey: resendIdemRef.current,
      });
      setSession((prev) => ({
        key: orderBoundary,
        credentials: prev.key === orderBoundary ? prev.credentials : null,
        code: prev.key === orderBoundary ? prev.code : null,
        downloaded: prev.key === orderBoundary ? prev.downloaded : false,
        resendDone: true,
      }));
    } catch {
      // Keep existing control geometry; no new error chrome.
      resendIdemRef.current = null;
    } finally {
      setResendBusy(false);
    }
  };

  const credentialRows =
    liveCredentials ??
    (getDomainSource("buyer") === "mock"
      ? purchase.credentialFields
      : purchase.credentialFields?.length
        ? purchase.credentialFields
        : []);
  const codeValue =
    liveCode ??
    (getDomainSource("buyer") === "mock" ? purchase.code?.value : "") ??
    "";

  return (
    <div className="grid gap-5 xl:grid-cols-[1.12fr_.88fr]">
      <section className={`${card} p-5 sm:p-7`}>
        <div className="flex flex-col gap-5 sm:flex-row">
          <ProductArt
            palette={purchase.palette}
            glyph={purchase.glyph}
            className="size-24 shrink-0 !rounded-2xl"
          />
          <div>
            <p className="text-[10px] font-bold text-[#718078]">
              {purchase.seller}
            </p>
            <h2 className="font-display mt-2 text-4xl leading-none">
              {purchase.product}
            </h2>
            <p className="mt-3 text-[9px] text-[#718078]">
              Pesanan #{purchase.orderId} • {purchase.purchasedAt}
            </p>
          </div>
          <span className="h-fit rounded-full bg-[#e9f7ef] px-3 py-1.5 text-[8px] font-extrabold text-[#287d4c] sm:ml-auto">
            PAID
          </span>
        </div>
        {purchase.updateAvailable && purchase.sellerUpdatesEnabled && (
          <div className="mt-6 rounded-2xl border border-[#cde0a9] bg-[#f0f8dd] p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-4 text-[#4b6b2a]" />
              <div>
                <b className="text-[10px]">
                  Versi baru {purchase.updateAvailable} tersedia
                </b>
                <p className="mt-1 text-[8px] leading-4 text-[#687653]">
                  Seller mengaktifkan product updates untuk pembelian ini. File
                  terbaru tersedia tanpa biaya tambahan.
                </p>
              </div>
              <button
                type="button"
                disabled={!versionUpdateEnabled || updated}
                onClick={() => {
                  // Api: DISABLED (no BE version-entitlement command). Mock only.
                  if (!versionUpdateEnabled) return;
                  setUpdated(true);
                }}
                className="ml-auto shrink-0 rounded-lg bg-[#173f2c] px-3 py-2 text-[8px] font-extrabold text-white disabled:opacity-60"
              >
                {updated ? "Sudah diperbarui" : "Gunakan versi baru"}
              </button>
            </div>
          </div>
        )}
        <div className="hairline mt-7 border-t pt-7">
          <h3 className="text-xs font-extrabold">Akses produk</h3>
          {purchase.deliveryType === "download" && purchase.downloads && (
            <div className="mt-4 rounded-2xl bg-[#eef3e9] p-5">
              <div className="flex items-center">
                <span className="grid size-11 place-items-center rounded-xl bg-white">
                  <FileDown className="size-5" />
                </span>
                <div className="ml-3">
                  <b className="block text-[10px]">
                    {purchase.downloads.fileName}
                  </b>
                  <span className="text-[8px] text-[#718078]">
                    {purchase.downloads.fileSize} • Versi{" "}
                    {updated ? purchase.updateAvailable : purchase.version}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void onDownload()}
                disabled={accessBusy}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white disabled:opacity-70"
              >
                {accessBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {effectiveDownloaded
                  ? "Signed download dibuat • berlaku 5 menit"
                  : "Unduh file dengan aman"}
              </button>
              <div className="mt-3 flex justify-between text-[8px] text-[#718078]">
                <span>
                  {purchase.downloads.used} dari {purchase.downloads.max}{" "}
                  unduhan digunakan
                </span>
                <span>Link portal hingga {purchase.downloads.expiresAt}</span>
              </div>
            </div>
          )}
          {purchase.deliveryType === "link" && purchase.protectedLink && (
            <div className="mt-4 rounded-2xl bg-[#eef3e9] p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-white">
                  <Link2 className="size-5" />
                </span>
                <div>
                  <b className="block text-[10px]">
                    {purchase.protectedLink.label}
                  </b>
                  <span className="text-[8px] text-[#718078]">
                    {purchase.protectedLink.host} • Terakhir dibuka{" "}
                    {purchase.protectedLink.lastOpened}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void onOpenProtectedLink()}
                disabled={accessBusy}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white disabled:opacity-70"
              >
                {accessBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    Buka akses terlindungi <ExternalLink className="size-4" />
                  </>
                )}
              </button>
            </div>
          )}
          {purchase.deliveryType === "credentials" && (
            <div className="mt-4 grid gap-3">
              {!credentialRows?.length && (
                <button
                  type="button"
                  onClick={() => void onRevealCredentials()}
                  disabled={accessBusy}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white disabled:opacity-70"
                >
                  {accessBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                  Tampilkan kredensial
                </button>
              )}
              {credentialRows?.map((field, i) => (
                <div
                  key={field.label}
                  className="hairline rounded-2xl border bg-[#f7f7f3] p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-extrabold tracking-wider text-[#718078] uppercase">
                      {field.label}
                    </span>
                    {field.secret && (
                      <button
                        type="button"
                        onClick={() =>
                          setRevealed({ ...revealed, [i]: !revealed[i] })
                        }
                        className="text-[#315d47]"
                      >
                        {revealed[i] ? (
                          <EyeOff className="size-3.5" />
                        ) : (
                          <Eye className="size-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex items-center">
                    <code className="min-w-0 flex-1 truncate text-[10px] font-bold">
                      {field.secret && !revealed[i]
                        ? "••••••••••••••••"
                        : field.value}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(field.value, field.label)}
                      className="hairline ml-3 rounded-lg border bg-white p-2"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                  {copied === field.label && (
                    <p className="mt-2 text-[8px] font-bold text-[#2e714f]">
                      Disalin ke clipboard
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {purchase.deliveryType === "code" && purchase.code && (
            <div className="hairline mt-4 rounded-2xl border bg-[#f7f7f3] p-5">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4" />
                <b className="text-[10px]">Kode produk pribadi</b>
                <span className="ml-auto rounded-full bg-[#fff4ce] px-2 py-1 text-[8px] font-bold text-[#8a6c22]">
                  {liveCode ? "Revealed" : purchase.code.status}
                </span>
              </div>
              {!codeValue ? (
                <button
                  type="button"
                  onClick={() => void onRevealCode()}
                  disabled={accessBusy}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white disabled:opacity-70"
                >
                  {accessBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                  Tampilkan kode
                </button>
              ) : (
                <div className="mt-4 flex rounded-xl border border-dashed border-[#173f2c]/25 bg-white p-4">
                  <code className="flex-1 text-sm font-black tracking-[.08em]">
                    {codeValue}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(codeValue, "code")}
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              )}
              <p className="mt-4 text-[9px] leading-5 text-[#718078]">
                {purchase.code.instructions}
              </p>
            </div>
          )}
          {accessError && (
            <p className="mt-3 text-[8px] font-bold text-[#8a4a3a]">
              Akses delivery tidak tersedia
            </p>
          )}
        </div>
        <div className="hairline mt-7 flex flex-wrap gap-2 border-t pt-6">
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={resendBusy || effectiveResendDone}
            className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[9px] font-bold disabled:opacity-70"
          >
            {resendBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Mail className="size-3.5" />
            )}
            {effectiveResendDone
              ? "Email delivery dikirim ulang"
              : "Kirim ulang email delivery"}
          </button>
          <Link
            href={`/account/purchases/${purchase.orderId}/invoice`}
            className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[9px] font-bold"
          >
            <Download className="size-3.5" /> Unduh Invoice PDF Resmi
          </Link>
        </div>
        <BuyerReviewCard
          product={purchase.product}
          orderItemId={purchase.orderItemId}
          productId={purchase.productId}
          orderId={purchase.orderId}
          existingReview={purchase.review}
        />
      </section>
      <aside className="grid content-start gap-4">
        <section className={`${card} p-5`}>
          <h3 className="text-xs font-extrabold">Ringkasan pesanan</h3>
          <div className="mt-5 grid gap-3">
            {[
              ["Status", "Paid"],
              ["Total", rupiah(purchase.price)],
              ["Pembayaran", "QRIS"],
              ["Email", "nadia@studio.id"],
              ["Order", purchase.orderId],
            ].map((x) => (
              <div key={x[0]} className="flex justify-between text-[9px]">
                <span className="text-[#718078]">{x[0]}</span>
                <b className="text-right">{x[1]}</b>
              </div>
            ))}
          </div>
        </section>
        <section className={`${card} p-5`}>
          <h3 className="text-xs font-extrabold">Aktivitas delivery</h3>
          <div className="mt-4 grid gap-4">
            {[
              [Check, "Pembayaran dikonfirmasi", "12 Jul • 14:33"],
              [PackageCheck, "Produk tersedia", "12 Jul • 14:33"],
              [Mail, "Email terkirim", "12 Jul • 14:34"],
            ].map(([Icon, title, time]) => (
              <div key={title as string} className="flex gap-3">
                <span className="grid size-7 place-items-center rounded-full bg-[#e9f5e7] text-[#2e714f]">
                  <Icon className="size-3" />
                </span>
                <div>
                  <b className="block text-[9px]">{title as string}</b>
                  <span className="text-[8px] text-[#718078]">
                    {time as string}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <Link
          href={`/@${purchase.sellerSlug}`}
          className={`${card} flex items-center p-4 text-[9px] font-extrabold`}
        >
          Lihat toko {purchase.seller}
          <ChevronRight className="ml-auto size-4" />
        </Link>
      </aside>
    </div>
  );
}
