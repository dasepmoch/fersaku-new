"use client";

import Link from "next/link";
import { ChevronLeft, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogProduct,
  PublicStorefront,
} from "@/features/catalog/contracts";
import { classifyThrown } from "@/shared/api/error-policy";
import {
  createIdempotencyIntentHolder,
  createPendingDedupe,
} from "@/shared/query/create-mutation";
import { isCheckoutApiDomain } from "./api";
import type { CheckoutIntent } from "./contracts";
import { CheckoutDetailsStep } from "./details-step";
import { useCheckoutIntentPoll, useCheckoutQuote } from "./hooks";
import {
  useCreateCheckoutIntentMutation,
  useSimulateCheckoutPaymentMutation,
} from "./mutations";
import { CheckoutOrderSummary } from "./order-summary";
import { clampIntegerIdr } from "./mappers";
import type { CheckoutStep } from "./pieces";
import { CheckoutPaidStep, CheckoutQrisStep } from "./qris-step";

export function CheckoutExperience({
  product,
  store,
}: {
  product: CatalogProduct;
  store: PublicStorefront;
}) {
  const router = useRouter();
  const apiCheckout = isCheckoutApiDomain();
  const simulateMutation = useSimulateCheckoutPaymentMutation();
  const createIntentMutation = useCreateCheckoutIntentMutation();
  const [step, setStep] = useState<CheckoutStep>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [customPrice, setCustomPrice] = useState(product.price);
  const [tip, setTip] = useState(0);
  const [upsell, setUpsell] = useState(false);
  const [wallet, setWallet] = useState("OVO");
  const [seconds, setSeconds] = useState(895);
  const [paying, setPaying] = useState(false);
  const [notification, setNotification] = useState(false);
  /** Live intent identity for poll (memory only; never query URL). */
  const [pollIntentId, setPollIntentId] = useState<string | null>(null);
  /** Create-response snapshot until poll overwrites (memory only). */
  const [createdSnapshot, setCreatedSnapshot] = useState<CheckoutIntent | null>(
    null,
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** One opaque key per logical pay intent; double-click reuses the same key. */
  const idempotencyRef = useRef(createIdempotencyIntentHolder());
  const pendingDedupeRef = useRef(createPendingDedupe());
  /** Non-secret intent identity in memory only (CHK-110); never query/storage. */
  const createdIntentRef = useRef<CheckoutIntent | null>(null);
  const upsellProduct = store.products.find(
    (p) => p.slug === "cursor-rules-kit",
  );
  /** Existing offer price (UI freeze); amount sent to quote as upsell line. */
  const upsellPrice = 39000;
  const minPrice = product.minimumPrice || product.price;
  const pwywMerchandise = product.allowPayWhatYouWant
    ? clampIntegerIdr(customPrice, minPrice)
    : product.price;

  const storeId = product.storeId || store.storeId || "";
  const quoteSelection = useMemo(
    () =>
      storeId
        ? {
            storeId,
            productId: product.id,
            merchandise: pwywMerchandise,
            tip,
            upsell: upsell ? upsellPrice : 0,
          }
        : null,
    [storeId, product.id, pwywMerchandise, tip, upsell, upsellPrice],
  );

  const { quote } = useCheckoutQuote(quoteSelection, {
    catalogPrice: product.price,
    enabled: Boolean(storeId),
  });

  /**
   * Display money from server quote when present.
   * Provisional catalog math is UX-only until first quote lands — never authority.
   */
  const merchandise = quote?.merchandise ?? pwywMerchandise;
  const displayTip = quote?.tip ?? tip;
  const displayUpsell = quote?.upsell ?? (upsell ? upsellPrice : 0);
  const total = quote?.gross ?? merchandise + displayTip + displayUpsell;
  const base = merchandise;
  const valid = name.trim().length > 2 && /.+@.+\..+/.test(email);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay);
    timers.current.push(timer);
  }, []);

  const onPollPaid = useCallback(
    (intent: CheckoutIntent) => {
      createdIntentRef.current = intent;
      setCreatedSnapshot(intent);
      setNotification(true);
      setStep("paid");
      setPaying(false);
      pendingDedupeRef.current.end();
      idempotencyRef.current.reset();
      const orderRef = intent.orderNumber || intent.orderId;
      const tipAmt = intent.tip;
      schedule(
        () =>
          router.push(
            `/orders/${encodeURIComponent(orderRef)}/success?total=${intent.gross}&tip=${tipAmt}&upsell=${upsell ? 1 : 0}`,
          ),
        1200,
      );
    },
    [router, schedule, upsell],
  );

  const onPollTerminalNonPaid = useCallback((intent: CheckoutIntent) => {
    createdIntentRef.current = intent;
    setCreatedSnapshot(intent);
    setPaying(false);
    pendingDedupeRef.current.end();
    // Stay on qris; no paid step / no mock success (snapshot has no failure card).
  }, []);

  const { intent: polledIntent, countdown: serverCountdown } =
    useCheckoutIntentPoll(apiCheckout ? pollIntentId : null, {
      enabled: apiCheckout && step === "qris" && Boolean(pollIntentId),
      onPaid: onPollPaid,
      onTerminalNonPaid: onPollTerminalNonPaid,
    });

  // Keep recovery ref aligned with latest poll snapshot (callback path).
  useEffect(() => {
    if (!polledIntent) return;
    createdIntentRef.current = polledIntent;
  }, [polledIntent]);

  const liveIntent = polledIntent ?? createdSnapshot;

  // Mock path keeps local countdown; api uses server expiresAt when available.
  useEffect(() => {
    if (step !== "qris") return;
    if (apiCheckout && serverCountdown != null) return;
    const interval = setInterval(
      () => setSeconds((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, [step, apiCheckout, serverCountdown]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const localTime = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const time =
    apiCheckout && serverCountdown != null ? serverCountdown : localTime;

  const displayTotal =
    apiCheckout && liveIntent?.gross != null ? liveIntent.gross : total;

  /** Mock/local only — existing simulator success path. */
  const payMock = () => {
    if (!pendingDedupeRef.current.tryBegin()) return;
    setPaying(true);
    setNotification(false);
    const idempotencyKey = idempotencyRef.current.getKey();
    void simulateMutation
      .mutateAsync({
        productId: product.id,
        storeSlug: store.slug,
        customer: { name, email },
        total,
        tip: displayTip,
        upsell,
        idempotencyKey,
      })
      .catch(() => {
        pendingDedupeRef.current.end();
        setPaying(false);
        setNotification(false);
      });
    schedule(() => setNotification(true), 650);
    schedule(() => {
      setStep("paid");
      setPaying(false);
      pendingDedupeRef.current.end();
      idempotencyRef.current.reset();
    }, 1850);
    schedule(
      () =>
        router.push(
          `/orders/FRS-240712-1848/success?total=${total}&tip=${displayTip}&upsell=${upsell ? 1 : 0}`,
        ),
      3000,
    );
  };

  /**
   * Api domain: createCheckoutIntent with opaque key.
   * Success → memory intent + start poll (CHK-120); no fake paid.
   * Failure → stay on qris, no paid step.
   * Unknown network → keep same key; no auto-create.
   */
  const payApi = () => {
    if (!pendingDedupeRef.current.tryBegin()) return;
    if (!storeId) {
      pendingDedupeRef.current.end();
      return;
    }
    // Already have intent: recovery is poll-only, never auto-mint new intent.
    if (createdIntentRef.current?.paymentIntentId) {
      setPollIntentId(createdIntentRef.current.paymentIntentId);
      setCreatedSnapshot(createdIntentRef.current);
      setPaying(false);
      pendingDedupeRef.current.end();
      return;
    }
    setPaying(true);
    setNotification(false);
    const idempotencyKey = idempotencyRef.current.getKey();
    const body = {
      storeId,
      productId: product.id,
      buyer: { name: name.trim(), email: email.trim() },
      idempotencyKey,
      payWhatYouWant: product.allowPayWhatYouWant
        ? pwywMerchandise
        : undefined,
      tip: displayTip > 0 ? displayTip : undefined,
      upsellProductIds:
        upsell && upsellProduct?.id ? [upsellProduct.id] : undefined,
    };
    idempotencyRef.current.bindBody({
      storeId: body.storeId,
      productId: body.productId,
      payWhatYouWant: body.payWhatYouWant,
      tip: body.tip,
      upsellProductIds: body.upsellProductIds,
      buyerEmail: body.buyer.email,
    });

    void createIntentMutation
      .mutateAsync(body)
      .then((intent) => {
        createdIntentRef.current = intent;
        setCreatedSnapshot(intent);
        setPollIntentId(intent.paymentIntentId);
        setPaying(false);
        pendingDedupeRef.current.end();
        // Keep idempotency key until PAID; poll is authority (CHK-120).
      })
      .catch((err: unknown) => {
        setPaying(false);
        pendingDedupeRef.current.end();
        // Failure: no paid/success. Unknown network: keep same key (no auto-create).
        void classifyThrown(err);
      });
  };

  const onPay = () => {
    if (paying || pendingDedupeRef.current.isPending()) return;
    if (apiCheckout) payApi();
    else payMock();
  };

  return (
    <main className="min-h-screen bg-[#f3f2ec]">
      <header className="mx-auto flex h-20 max-w-[1160px] items-center justify-between px-5">
        <Link
          href={`/@${store.slug}/${product.slug}`}
          className="flex items-center gap-2 text-[10px] font-bold text-[#718078]"
        >
          <ChevronLeft className="size-4" /> Kembali ke produk
        </Link>
        <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-[#748078] uppercase">
          <LockKeyhole className="size-3.5" /> Secure checkout
        </span>
      </header>
      <div className="mx-auto grid max-w-[1080px] gap-8 px-5 pt-5 pb-16 lg:grid-cols-[1fr_470px] lg:items-start lg:pt-10">
        <CheckoutOrderSummary
          product={product}
          store={store}
          base={base}
          tip={displayTip}
          upsell={upsell && displayUpsell > 0}
          upsellProduct={upsellProduct}
          upsellPrice={displayUpsell > 0 ? displayUpsell : upsellPrice}
          total={displayTotal}
        />
        <section className="hairline shadow-float rounded-[32px] border bg-[#fbfaf7] p-5 sm:p-8">
          {step === "details" && (
            <CheckoutDetailsStep
              product={product}
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              customPrice={customPrice}
              setCustomPrice={setCustomPrice}
              tip={tip}
              setTip={setTip}
              upsell={upsell}
              setUpsell={setUpsell}
              upsellProduct={upsellProduct}
              upsellPrice={upsellPrice}
              total={total}
              valid={valid}
              onContinue={() => setStep("qris")}
            />
          )}
          {step === "qris" && (
            <CheckoutQrisStep
              total={displayTotal}
              time={time}
              wallet={wallet}
              setWallet={setWallet}
              notification={notification}
              setNotification={setNotification}
              paying={paying}
              onPay={onPay}
              onBack={() => setStep("details")}
              qrString={apiCheckout ? liveIntent?.qrString : undefined}
              qrImageUrl={apiCheckout ? liveIntent?.qrImageUrl : undefined}
            />
          )}
          {step === "paid" && <CheckoutPaidStep />}
        </section>
      </div>
    </main>
  );
}
