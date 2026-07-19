"use client";

import Link from "next/link";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";
import { useEffect } from "react";
import { reportError } from "@/shared/observability/reporter";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { source: "app-error-boundary", digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f7f2] p-6 text-[#17231d]">
      <section className="hairline shadow-float w-full max-w-lg rounded-[28px] border bg-white p-8 text-center">
        <AlertTriangle className="mx-auto size-8 text-[#d65e45]" />
        <h1 className="mt-5 text-2xl font-extrabold">
          Terjadi kesalahan yang tidak terduga
        </h1>
        <p className="mt-3 text-sm text-[#68756d]">
          Tidak ada transaksi atau perubahan sensitif yang akan diulang
          otomatis.
        </p>
        <div className="mt-7 flex justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#173f2c] px-4 text-xs font-extrabold text-white"
          >
            <RefreshCcw className="size-4" /> Coba lagi
          </button>
          <Link
            href="/"
            className="hairline inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-xs font-extrabold"
          >
            <Home className="size-4" /> Beranda
          </Link>
        </div>
      </section>
    </main>
  );
}
