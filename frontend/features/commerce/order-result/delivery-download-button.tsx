"use client";

/**
 * CHK-140 — order-result success download CTA.
 * Claims delivery access on demand; secrets/object id stay in component memory.
 * No permanent secret storage; signed URL only if BE returns one in secrets.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import {
  accessOrderDelivery,
  DELIVERY_SECRET_MEMORY_TTL_MS,
  extractOpenUrlFromClaim,
  isDeliveryClaimExpired,
  isOrderDeliveryApiDomain,
  type DeliveryAccessClaim,
} from "@/features/commerce/delivery-access";
import { getDomainSource } from "@/shared/data/domain-source";

type Props = {
  orderId: string;
  productTitle: string;
  /** Guest capability token held in parent memory only (optional). */
  capabilityToken?: string;
};

export function OrderResultDeliveryDownloadButton({
  orderId,
  productTitle,
  capabilityToken,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState(false);
  const claimRef = useRef<DeliveryAccessClaim | null>(null);

  const clearClaim = useCallback(() => {
    claimRef.current = null;
    setClaimed(false);
  }, []);

  useEffect(() => {
    return () => {
      claimRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        const c = claimRef.current;
        if (c && isDeliveryClaimExpired(c, Date.now(), DELIVERY_SECRET_MEMORY_TTL_MS)) {
          clearClaim();
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [clearClaim]);

  const onClick = async () => {
    if (busy) return;
    setError(false);

    // Domain mock: local success shell only (no network secret).
    if (getDomainSource("checkout") === "mock") {
      setClaimed(true);
      return;
    }

    if (!isOrderDeliveryApiDomain()) {
      setError(true);
      return;
    }

    setBusy(true);
    try {
      const claim = await accessOrderDelivery(orderId, {
        token: capabilityToken,
      });
      if (!claim) {
        setError(true);
        return;
      }
      claimRef.current = claim;
      setClaimed(true);

      const openUrl = extractOpenUrlFromClaim(claim);
      if (openUrl) {
        window.open(openUrl, "_blank", "noopener,noreferrer");
      }
      // DOWNLOAD with only downloadObjectId: claim recorded; signed exchange gap.
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-sm font-extrabold text-white disabled:opacity-70"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        {claimed
          ? "Akses delivery diklaim"
          : `Unduh ${productTitle}`}
        {!claimed && !busy && <ArrowRight className="size-4" />}
      </button>
      {error && (
        <p className="mt-2 text-center text-[10px] font-bold text-[#8a4a3a]">
          Akses delivery tidak tersedia
        </p>
      )}
    </div>
  );
}
