"use client";

import Link from "next/link";
import { ChevronLeft, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  CatalogProduct,
  PublicStorefront,
} from "@/features/catalog/contracts";
import { CheckoutDetailsStep } from "./details-step";
import { useSimulateCheckoutPaymentMutation } from "./mutations";
import { CheckoutOrderSummary } from "./order-summary";
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
  const upsellProduct = store.products.find(
    (p) => p.slug === "cursor-rules-kit",
  );
  const upsellPrice = 39000;
  const base = product.allowPayWhatYouWant
    ? Math.max(product.minimumPrice || product.price, customPrice)
    : product.price;
  const total = base + tip + (upsell ? upsellPrice : 0);
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
    setPaying(true);
    setNotification(false);
    void paymentMutation
      .mutateAsync({
        productId: product.id,
        storeSlug: store.slug,
        customer: { name, email },
        total,
        tip,
        upsell,
        idempotencyKey: `checkout_${product.id}_${email}`,
      })
      .catch(() => {
        setPaying(false);
        setNotification(false);
      });
    schedule(() => setNotification(true), 650);
    schedule(() => {
      setStep("paid");
      setPaying(false);
    }, 1850);
    schedule(
      () =>
        router.push(
          `/orders/FRS-240712-1848/success?total=${total}&tip=${tip}&upsell=${upsell ? 1 : 0}`,
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
          tip={tip}
          upsell={upsell}
          upsellProduct={upsellProduct}
          upsellPrice={upsellPrice}
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
