"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useEffect } from "react";
import { reportError } from "@/shared/observability/reporter";

export default function SellerWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, {
      source: "seller-workspace-error-boundary",
      digest: error.digest,
    });
  }, [error]);
  return (
    <section className="rounded-[24px] border border-[#efc6bc] bg-[#fff4ef] p-8 text-[#713f35]">
      <AlertTriangle className="size-7" />
      <h2 className="mt-5 text-xl font-extrabold">
        Dashboard tidak dapat dimuat
      </h2>
      <p className="mt-2 text-sm opacity-70">
        Coba ulangi permintaan. Data finansial dan transaksi tidak berubah.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#173f2c] px-4 text-xs font-extrabold text-white"
      >
        <RefreshCcw className="size-4" /> Coba lagi
      </button>
    </section>
  );
}
