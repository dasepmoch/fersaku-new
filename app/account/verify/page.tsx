import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand";
export default function VerifyBuyerPage() {
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
