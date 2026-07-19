import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f7f2] p-6 text-[#17231d]">
      <section className="hairline shadow-float w-full max-w-lg rounded-[30px] border bg-white p-9 text-center">
        <SearchX className="mx-auto size-9 text-[#6e7e73]" />
        <p className="mt-5 text-[10px] font-extrabold tracking-[.18em] text-[#7b8780] uppercase">
          404 - Not found
        </p>
        <h1 className="font-display mt-3 text-4xl">Halaman tidak ditemukan.</h1>
        <p className="mt-3 text-sm leading-6 text-[#68756d]">
          Alamat mungkin berubah atau kamu tidak memiliki akses ke resource
          tersebut.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[#173f2c] px-5 text-xs font-extrabold text-white"
        >
          <ArrowLeft className="size-4" /> Kembali ke Fersaku
        </Link>
      </section>
    </main>
  );
}
