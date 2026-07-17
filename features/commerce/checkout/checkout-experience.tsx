"use client";

import Link from "next/link";
import { ChevronLeft, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogProduct,
  PublicStorefront,
} from "@/features/catalog/contracts";
import {
  createIdempotencyIntentHolder,
  createPendingDedupe,
} from "@/shared/query/create-mutation";
import { CheckoutDetailsStep } from "./details-step";
import { useCheckoutQuote } from "./hooks";
import { useSimulateCheckoutPaymentMutation } from "./mutations";
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
  const paymentMutation = useSimulateCheckoutPaymentMutation();
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** One opaque key per logical pay intent; double-click reuses the same key. */
  const idempotencyRef = useRef(createIdempotencyIntentHolder());
  const pendingDedupeRef = useRef(createPendingDedupe());
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

  useEffect(() => {
    if (step !== "qris") return;
    const interval = setInterval(
      () => setSeconds((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, [step]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );
  const schedule = (callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay);
    timers.current.push(timer);
  };
  const time = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const simulate = () => {
    if (!pendingDedupeRef.current.tryBegin()) return;
    setPaying(true);
    setNotification(false);
    const idempotencyKey = idempotencyRef.current.getKey();
    void paymentMutation
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
          total={total}
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
              total={total}
              time={time}
              wallet={wallet}
              setWallet={setWallet}
              notification={notification}
              setNotification={setNotification}
              paying={paying}
              onPay={simulate}
              onBack={() => setStep("details")}
            />
          )}
          {step === "paid" && <CheckoutPaidStep />}
        </section>
      </div>
    </main>
  );
}
