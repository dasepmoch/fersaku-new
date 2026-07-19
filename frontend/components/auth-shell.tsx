import Link from "next/link";
import { BarChart3, Check } from "lucide-react";
import { getDomainSource } from "@/shared/data/domain-source";
import { Logo } from "./brand";
import { AuthForm } from "./auth-form";

/** AUT-130: OAuth OUT-OF-SCOPE for launch; API/live must not no-op. */
const GOOGLE_OAUTH_DISABLED_TITLE =
  "Google sign-in is out of scope for launch (AUT-130 deferred)";

export function AuthShell({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const authSource = (() => {
    try {
      return getDomainSource("auth");
    } catch {
      return "api";
    }
  })();
  // Mock may keep prototype affordance; API/disabled must be authoritatively disabled.
  const googleOAuthEnabled = authSource === "mock";
  return (
    <main className="grid min-h-screen bg-[#f8f7f2] lg:grid-cols-2">
      <section className="flex min-h-screen flex-col p-5 sm:p-8 lg:p-12">
        <Logo />
        <div className="mx-auto my-auto w-full max-w-[430px] py-12">
          <p className="text-[11px] font-extrabold tracking-[.16em] text-[#557060] uppercase">
            {register ? "Mulai perjalananmu" : "Selamat datang kembali"}
          </p>
          <h1 className="font-display mt-4 text-5xl leading-[.92] tracking-[-.04em] sm:text-6xl">
            {register
              ? "Buka toko digitalmu hari ini."
              : "Lanjutkan karya besarmu."}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#6e7b73]">
            {register
              ? "Gratis untuk mulai. Kamu hanya membayar ketika berhasil menjual."
              : "Masuk untuk melihat pesanan, produk, dan pertumbuhan tokomu."}
          </p>
          <AuthForm mode={mode} />
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#17231d]/10" />
            <span className="text-[10px] font-bold tracking-wider text-[#929b96] uppercase">
              atau
            </span>
            <span className="h-px flex-1 bg-[#17231d]/10" />
          </div>
          <button
            type="button"
            disabled={!googleOAuthEnabled}
            title={googleOAuthEnabled ? undefined : GOOGLE_OAUTH_DISABLED_TITLE}
            className="hairline flex h-12 w-full items-center justify-center gap-3 rounded-xl border bg-white text-sm font-bold transition hover:bg-[#f3f4ef] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
          >
            <span className="text-lg font-black">G</span> Lanjutkan dengan
            Google
          </button>
          <p className="mt-7 text-center text-xs text-[#6f7b74]">
            {register ? "Sudah punya akun? " : "Belum punya akun? "}
            <Link
              href={register ? "/login" : "/register"}
              className="font-extrabold text-[#245d41]"
            >
              {register ? "Masuk" : "Daftar gratis"}
            </Link>
          </p>
        </div>
      </section>
      <section className="noise relative hidden overflow-hidden bg-[#173f2c] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-20 -right-24 size-96 rounded-full border border-white/10" />
        <div className="absolute top-10 -right-8 size-64 rounded-full border border-white/10" />
        <div className="relative my-auto">
          <p className="font-display max-w-xl text-5xl leading-[.98] tracking-[-.035em]">
            “Dalam seminggu, checkout yang lebih simpel menaikkan konversi
            tokoku hampir dua kali lipat.”
          </p>
          <div className="mt-7 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#ffb69d] text-xs font-extrabold text-[#173f2c]">
              AR
            </span>
            <div>
              <p className="text-sm font-extrabold">Alya Rahman</p>
              <p className="text-xs text-white/45">Creator, Rumah Template</p>
            </div>
          </div>
          <div className="shadow-float mt-14 max-w-[560px] rotate-[-2deg] rounded-[30px] bg-[#f7f6f1] p-5 text-[#17231d]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-wider text-[#7a867f] uppercase">
                  Pendapatan bulan ini
                </p>
                <p className="mt-2 text-3xl font-extrabold">Rp24.860.000</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-[#d7ff64]">
                <BarChart3 className="size-5" />
              </span>
            </div>
            <div className="mt-7 flex h-28 items-end gap-2">
              {[35, 42, 55, 47, 72, 62, 85, 78, 100].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-md bg-[#173f2c]"
                  style={{ height: `${h}%`, opacity: 0.25 + i * 0.08 }}
                />
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#e7f6e9] p-3 text-xs font-bold text-[#286747]">
              <Check className="size-4" /> 312 pesanan berhasil dikirim otomatis
            </div>
          </div>
        </div>
        <p className="relative mt-auto text-[10px] font-bold tracking-[.13em] text-white/30 uppercase">
          Dibuat di Indonesia, untuk Indonesia.
        </p>
      </section>
    </main>
  );
}
