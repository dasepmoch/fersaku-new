"use client";

/**
 * AUT-110 — buyer magic-link consume shell.
 * Reads fragment token client-side, scrubs URL immediately, POSTs once.
 * Success: existing static success markup. Invalid/expired: existing NotFound.
 * No token in query/path/storage/analytics.
 */

import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  hasForbiddenTokenInLocation,
  parseMagicLinkFragmentToken,
  scrubUrlFragment,
  toBuyerMagicLinkConsumeRequest,
  useBuyerMagicLinkConsumeMutation,
} from "@/features/auth";
import { Logo } from "@/components/brand";

type Phase = "pending" | "success" | "invalid";

export function BuyerVerify() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const consumeMutation = useBuyerMagicLinkConsumeMutation();
  const [phase, setPhase] = useState<Phase>("pending");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    const finish = (next: Phase) => {
      if (!cancelled) setPhase(next);
    };

    // Forbidden: token in query/path — never consume; map to safe NotFound.
    if (
      hasForbiddenTokenInLocation({
        search: typeof window !== "undefined" ? window.location.search : "",
        pathname: typeof window !== "undefined" ? window.location.pathname : "",
      })
    ) {
      scrubUrlFragment();
      queueMicrotask(() => finish("invalid"));
      return () => {
        cancelled = true;
      };
    }

    const token = parseMagicLinkFragmentToken(
      typeof window !== "undefined" ? window.location.hash : "",
    );
    // Scrub before any network / navigation (email scanners already only GET).
    scrubUrlFragment();

    if (!token) {
      queueMicrotask(() => finish("invalid"));
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const result = await consumeMutation.mutateAsync({
        ...toBuyerMagicLinkConsumeRequest({ token }),
        returnTo,
      });
      if (cancelled) return;
      if (result.ok) {
        finish("success");
        if (result.redirectTo && result.redirectTo !== "/account/purchases") {
          router.replace(result.redirectTo);
        }
        return;
      }
      // invalid_token / blocked: no fake success — existing NotFound only.
      finish("invalid");
    })();

    return () => {
      cancelled = true;
    };
    // Run once on mount — fragment must be read immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional single consume
  }, []);

  if (phase === "invalid") {
    notFound();
  }

  if (phase === "pending") {
    // Hold same shell geometry without claiming success before consume.
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f2ec] p-5">
        <div className="hairline shadow-float w-full max-w-md rounded-[30px] border bg-white p-8 text-center">
          <div className="flex justify-center">
            <Logo />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f2ec] p-5">
      <div className="hairline shadow-float w-full max-w-md rounded-[30px] border bg-white p-8 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <span className="mx-auto mt-10 grid size-16 place-items-center rounded-full bg-[#d7ff64]">
          <Check className="size-7" />
        </span>
        <h1 className="font-display mt-6 text-5xl">Email terverifikasi.</h1>
        <p className="mt-3 text-xs leading-5 text-[#718078]">
          Magic link digunakan satu kali dan sesi buyer portal telah dibuat
          untuk perangkat ini.
        </p>
        <Link
          href="/account/purchases"
          className="mt-7 flex h-12 items-center justify-center rounded-xl bg-[#173f2c] text-xs font-extrabold text-white"
        >
          Buka koleksi pembelian
        </Link>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[8px] text-[#718078]">
          <ShieldCheck className="size-3" /> Sesi aktif selama 30 hari
        </p>
      </div>
    </main>
  );
}
