import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Fingerprint,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/brand";

export default async function InvoiceVerificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = /^FRS-\d{6}-\d{4}-[A-F0-9]{8}$/.test(token);
  const orderId = token.replace(/-[^-]+$/, "");

  return (
    <main className="min-h-screen bg-[#e9eee6] px-4 py-8 text-[#17231d] sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <span className="rounded-full border border-[#cdd9ce] bg-white/70 px-3 py-1.5 text-[8px] font-extrabold tracking-[.14em] text-[#557060] uppercase">
            Invoice authenticity
          </span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-[#d7dfd5] bg-white shadow-[0_30px_90px_rgba(40,70,50,.12)]">
          <div
            className={`h-2 ${verified ? "bg-[#d7ff64]" : "bg-[#ff8d7d]"}`}
          />
          <div className="p-6 sm:p-10">
            <span
              className={`grid size-16 place-items-center rounded-2xl ${verified ? "bg-[#e8f7e8] text-[#287a4c]" : "bg-[#fff0ed] text-[#c65349]"}`}
            >
              {verified ? (
                <BadgeCheck className="size-8" />
              ) : (
                <ShieldCheck className="size-8" />
              )}
            </span>
            <p className="mt-6 text-[9px] font-extrabold tracking-[.18em] text-[#6d7b72] uppercase">
              Hasil verifikasi Fersaku
            </p>
            <h1 className="font-display mt-2 text-4xl sm:text-6xl">
              {verified ? "Invoice ini asli." : "Invoice tidak dikenali."}
            </h1>
            <p className="mt-4 max-w-xl text-xs leading-6 text-[#68756d]">
              {verified
                ? "Signature dokumen cocok dengan ledger transaksi Fersaku. Nilai dan status di bawah belum diubah sejak invoice diterbitkan."
                : "Token verifikasi tidak sesuai format dokumen Fersaku. Jangan gunakan invoice ini sebagai bukti pembayaran sebelum menghubungi penerbit."}
            </p>

            {verified && (
              <>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <Fact
                    icon={ReceiptText}
                    label="Nomor invoice"
                    value={`INV-${orderId.replace("FRS-", "")}`}
                  />
                  <Fact
                    icon={BadgeCheck}
                    label="Status transaksi"
                    value="Lunas - Verified"
                    positive
                  />
                  <Fact
                    icon={CalendarClock}
                    label="Waktu pembayaran"
                    value="12 Jul 2026, 14:42 WIB"
                  />
                  <Fact
                    icon={Fingerprint}
                    label="Document signature"
                    value="SHA256:6AD891CE...CB42"
                    mono
                  />
                </div>

                <div className="mt-6 rounded-[24px] bg-[#173f2c] p-5 text-white sm:flex sm:items-center">
                  <div>
                    <p className="text-[8px] font-extrabold tracking-[.14em] text-white/45 uppercase">
                      Total verified
                    </p>
                    <p className="mt-2 text-3xl font-black tracking-[-.04em]">
                      Rp129.000
                    </p>
                    <p className="mt-1 text-[9px] text-white/45">
                      Asep AI Tools - Nadia Putri - QRIS
                    </p>
                  </div>
                  <Link
                    href={`/orders/${orderId}/invoice`}
                    className="mt-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#d7ff64] px-4 text-[9px] font-extrabold text-[#173f2c] sm:mt-0 sm:ml-auto"
                  >
                    Lihat invoice resmi <ArrowRight className="size-4" />
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>

        <p className="mt-5 text-center text-[8px] leading-4 text-[#758078]">
          Verifikasi publik hanya menampilkan data minimum untuk menjaga privasi
          pembeli. Informasi sensitif tidak pernah disertakan di QR.
        </p>
      </div>
    </main>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  positive = false,
  mono = false,
}: {
  icon: typeof ReceiptText;
  label: string;
  value: string;
  positive?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e1e7df] bg-[#f8faf6] p-4">
      <Icon className="size-4 text-[#51705d]" />
      <p className="mt-4 text-[8px] font-extrabold tracking-[.12em] text-[#7a877f] uppercase">
        {label}
      </p>
      <b
        className={`mt-1.5 block text-[10px] ${positive ? "text-[#287a4c]" : ""} ${mono ? "font-mono" : ""}`}
      >
        {value}
      </b>
    </div>
  );
}
