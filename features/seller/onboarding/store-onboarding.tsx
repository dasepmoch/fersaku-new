"use client";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Globe2,
  LoaderCircle,
  PackagePlus,
  Palette,
  Sparkles,
  Store,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";

const steps = [
  "Welcome",
  "Identitas",
  "Alamat toko",
  "Visual",
  "Produk pertama",
  "Selesai",
];

export function StoreOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [slug, setSlug] = useState("");
  const [accent, setAccent] = useState("#d7ff64");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const progress = ((step + 1) / steps.length) * 100;
  const canContinue = useMemo(
    () =>
      step === 1
        ? name.trim().length > 2 && bio.trim().length > 12
        : step === 2
          ? slug.length > 3 && available === true
          : true,
    [step, name, bio, slug, available],
  );
  const checkSlug = (value: string) => {
    const clean = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");
    setSlug(clean);
    setAvailable(null);
    if (clean.length > 3) {
      setChecking(true);
      setTimeout(() => {
        setChecking(false);
        setAvailable(!["admin", "fersaku", "asep-ai-tools"].includes(clean));
      }, 500);
    }
  };
  return (
    <main className="min-h-screen bg-[#f1f2ed]">
      <header className="hairline flex h-20 items-center justify-between border-b bg-[#f8f7f2] px-5 sm:px-8">
        <Logo />
        <span className="text-[10px] font-extrabold tracking-[.14em] text-[#718078] uppercase">
          Store setup • {step + 1}/{steps.length}
        </span>
      </header>
      <div className="h-1 bg-[#e2e5df]">
        <div
          className="h-full bg-[#173f2c] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <section className="mx-auto grid min-h-[calc(100vh-85px)] max-w-[1180px] items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_420px]">
        <div className="mx-auto w-full max-w-[650px]">
          {step === 0 && (
            <Step
              icon={Sparkles}
              eyebrow="Selamat datang di Fersaku"
              title="Mari beri rumah yang indah untuk karyamu."
              description="Setup ini hanya butuh beberapa menit. Semua pengaturan tetap bisa kamu ubah kapan saja dari dashboard."
            />
          )}{" "}
          {step === 1 && (
            <div>
              <Step
                icon={Store}
                eyebrow="Identitas toko"
                title="Ceritakan sedikit tentang tokomu."
                description="Nama dan deskripsi ini muncul di storefront, checkout, dan receipt pembeli."
              />
              <div className="mt-7 grid gap-4">
                <Label label="Nama toko">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Asep AI Tools"
                    className="hairline h-13 rounded-2xl border bg-white px-4 text-sm outline-none"
                  />
                </Label>
                <Label label="Deskripsi singkat">
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    placeholder="Apa yang kamu buat dan untuk siapa?"
                    className="hairline rounded-2xl border bg-white p-4 text-sm leading-6 outline-none"
                  />
                </Label>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <Step
                icon={Globe2}
                eyebrow="Alamat toko"
                title="Pilih alamat yang mudah diingat."
                description="Gunakan huruf kecil, angka, dan tanda hubung. Slug dapat diganti dengan cooldown keamanan."
              />
              <div className="mt-7">
                <Label label="URL storefront">
                  <div className="hairline flex h-13 overflow-hidden rounded-2xl border bg-white">
                    <span className="flex items-center bg-[#eef0eb] px-4 text-xs font-bold text-[#718078]">
                      fersaku.id/@
                    </span>
                    <input
                      value={slug}
                      onChange={(e) => checkSlug(e.target.value)}
                      placeholder="nama-toko"
                      className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                    />
                    {checking && (
                      <LoaderCircle className="mr-4 size-4 animate-spin self-center" />
                    )}
                    {available === true && (
                      <CheckCircle2 className="mr-4 size-4 self-center text-[#2e714f]" />
                    )}
                  </div>
                </Label>
                {available !== null && (
                  <p
                    className={cn(
                      "mt-2 text-[10px] font-bold",
                      available ? "text-[#2e714f]" : "text-[#b2573c]",
                    )}
                  >
                    {available
                      ? `fersaku.id/@${slug} tersedia`
                      : "Alamat ini sudah digunakan. Coba variasi lain."}
                  </p>
                )}
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <Step
                icon={Palette}
                eyebrow="Rasa visual"
                title="Pilih aksen pertama untuk brandmu."
                description="Kami siapkan layout Atelier yang fleksibel. Kamu bisa mengubah font, hero, kartu, dan section setelah setup."
              />
              <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {[
                  "#d7ff64",
                  "#ff7958",
                  "#71d7ff",
                  "#ffd75a",
                  "#b8f2d3",
                  "#f4a8ff",
                ].map((x) => (
                  <button
                    key={x}
                    onClick={() => setAccent(x)}
                    className={cn(
                      "aspect-square rounded-[22px] border-4 transition",
                      accent === x
                        ? "scale-105 border-[#173f2c]"
                        : "border-white",
                    )}
                    style={{ backgroundColor: x }}
                  />
                ))}
              </div>
            </div>
          )}
          {step === 4 && (
            <div>
              <Step
                icon={PackagePlus}
                eyebrow="Produk pertama"
                title="Mau mulai mengisi etalase sekarang?"
                description="Kamu bisa membuat produk digital, protected link, atau stok credential. Langkah ini boleh dilewati."
              />
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {[
                  "Digital download",
                  "Protected link",
                  "Stock / credential",
                ].map((x) => (
                  <button
                    key={x}
                    className="hairline rounded-[22px] border bg-white p-5 text-left transition hover:-translate-y-1 hover:border-[#173f2c]"
                  >
                    <PackagePlus className="size-5" />
                    <b className="mt-6 block text-xs">{x}</b>
                    <span className="mt-1 block text-[9px] leading-4 text-[#718078]">
                      Setup delivery setelah toko aktif.
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 5 && (
            <div>
              <Step
                icon={BadgeCheck}
                eyebrow="Toko siap"
                title={`${name || "Tokomu"} resmi punya rumah.`}
                description="Storefront mock telah dibuat. Selanjutnya lengkapi produk, rekening payout, MFA, dan test webhook."
              />
              <div className="mt-7 rounded-[24px] border border-[#bfd8aa] bg-[#edf8df] p-5">
                <div className="flex items-center gap-3">
                  <span
                    className="grid size-11 place-items-center rounded-xl font-black text-[#173f2c]"
                    style={{ backgroundColor: accent }}
                  >
                    {(name || "T")[0]}
                  </span>
                  <div>
                    <b className="text-xs">fersaku.id/@{slug || "toko-kamu"}</b>
                    <p className="mt-1 text-[9px] text-[#65736b]">
                      Atelier theme • Published
                    </p>
                  </div>
                  <Check className="ml-auto size-5 text-[#2e714f]" />
                </div>
              </div>
            </div>
          )}
          <div className="mt-10 flex items-center gap-3">
            {step > 0 && step < 5 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="hairline flex h-12 items-center gap-2 rounded-xl border bg-white px-5 text-[10px] font-bold"
              >
                <ArrowLeft className="size-4" /> Kembali
              </button>
            )}
            <button
              disabled={!canContinue}
              onClick={() =>
                step === 5 ? router.push("/dashboard") : setStep((s) => s + 1)
              }
              className="ml-auto flex h-12 items-center gap-2 rounded-xl bg-[#173f2c] px-6 text-[10px] font-extrabold text-white disabled:opacity-35"
            >
              {step === 4
                ? "Lewati untuk sekarang"
                : step === 5
                  ? "Masuk ke dashboard"
                  : "Lanjutkan"}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
        <aside className="hidden lg:block">
          <div className="noise shadow-float rounded-[34px] bg-[#173f2c] p-6 text-white">
            <div className="rounded-[24px] bg-[#f4f2eb] p-3 text-[#17231d]">
              <div className="rounded-[20px] bg-[#173f2c] p-6 text-white">
                <span
                  className="grid size-12 place-items-center rounded-xl text-lg font-black text-[#173f2c]"
                  style={{ backgroundColor: accent }}
                >
                  {(name || "T")[0]}
                </span>
                <p className="mt-7 text-[7px] font-bold tracking-[.18em] text-white/45 uppercase">
                  Your new storefront
                </p>
                <h3 className="font-display mt-2 text-3xl">
                  {name || "Nama tokomu"}
                </h3>
                <p className="mt-2 text-[8px] leading-4 text-white/50">
                  {bio || "Deskripsi toko akan tampil indah di sini."}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[accent, "#c9defd"].map((x, i) => (
                  <div key={x} className="rounded-xl bg-white p-2">
                    <div
                      className="aspect-square rounded-lg"
                      style={{ backgroundColor: x }}
                    />
                    <p className="mt-2 text-[7px] font-bold">
                      Produk digital {i + 1}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <p className="font-display mt-5 text-center text-2xl text-white/65">
              “Mulai kecil. Rawat dengan sungguh.”
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
function Step({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: typeof Store;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <span className="grid size-12 place-items-center rounded-2xl bg-[#d7ff64] text-[#173f2c]">
        <Icon className="size-5" />
      </span>
      <p className="mt-7 text-[10px] font-extrabold tracking-[.16em] text-[#315d47] uppercase">
        {eyebrow}
      </p>
      <h1 className="font-display mt-3 max-w-2xl text-5xl leading-[.95] tracking-[-.04em] sm:text-6xl">
        {title}
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[#68756d]">
        {description}
      </p>
    </div>
  );
}
function Label({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-[10px] font-extrabold">
      {label}
      {children}
    </label>
  );
}
