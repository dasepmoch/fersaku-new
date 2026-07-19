"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  FileCheck2,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "./brand";
import { rupiah } from "@/lib/utils";
import type { InvoiceProjection } from "@/features/commerce/invoice";

/**
 * Existing invoice print chrome — markup/class/copy frozen.
 * Data only via projection (CHK-150); never recompute totals client-side.
 */
export function InvoiceView({
  orderId,
  projection,
}: {
  orderId: string;
  /** When omitted (legacy), mock geometry is not used — callers must pass projection. */
  projection: InvoiceProjection;
}) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  const verificationUrl = projection.verificationPath;
  const productSubtotal = projection.subtotalIdr;
  const tip = projection.tipIdr;
  const couponDiscount = projection.discountIdr;
  const fee = projection.feeIdr;
  const total = projection.grossIdr;
  const displayOrderId = projection.orderNumber || orderId;

  useEffect(() => {
    if (!qrRef.current || !verificationUrl) return;
    const url = `${window.location.origin}${verificationUrl}`;
    void QRCode.toCanvas(qrRef.current, url, {
      width: 144,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#17231d", light: "#ffffff" },
    });
  }, [verificationUrl]);

  const couponLabel = projection.couponCode
    ? `Potongan kupon ${projection.couponCode}`
    : "Potongan kupon";

  return (
    <main className="invoice-page min-h-screen bg-[#e9eae5] px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between gap-3 print:hidden">
        <Link
          href={projection.backHref}
          className="flex items-center gap-2 text-[10px] font-bold"
        >
          <ArrowLeft className="size-4" /> Kembali ke pembelian
        </Link>
        <button
          type="button"
          onClick={() => {
            if (projection.canPrint) window.print();
          }}
          className="flex h-11 items-center gap-2 rounded-xl bg-[#173f2c] px-5 text-[10px] font-extrabold text-white shadow-lg shadow-[#173f2c]/15"
        >
          <Download className="size-4" /> Unduh Invoice PDF Resmi
        </button>
      </div>

      <article className="invoice-document mx-auto min-h-[1080px] max-w-[820px] overflow-hidden bg-white text-[#17231d] shadow-2xl print:min-h-0 print:max-w-none print:shadow-none">
        <div className="h-2 bg-[#d7ff64]" />
        <div className="p-7 sm:p-12">
          <header className="flex items-start justify-between border-b border-[#17231d]/10 pb-10">
            <div>
              <Logo />
              <p className="mt-4 flex items-center gap-2 text-[8px] font-extrabold tracking-[.16em] text-[#47735b] uppercase">
                <ShieldCheck className="size-3.5" /> Dokumen pembayaran
                terverifikasi
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-extrabold tracking-[.2em] text-[#718078] uppercase">
                Official paid invoice
              </p>
              <h1 className="font-display mt-2 text-5xl">Invoice</h1>
              <span className="mt-3 inline-flex rounded-full bg-[#e9f6ec] px-3 py-1.5 text-[8px] font-extrabold text-[#26764a]">
                LUNAS
              </span>
            </div>
          </header>

          <section className="grid gap-8 border-b border-[#17231d]/10 py-10 sm:grid-cols-3">
            <Info
              label="Nomor invoice"
              value={projection.invoiceNumber}
              note={projection.issuedLabel}
            />
            <Info
              label="Ditagihkan kepada"
              value={projection.buyerName}
              note={projection.buyerNote}
            />
            <Info
              label="Diterbitkan oleh"
              value={projection.issuerName}
              note={projection.issuerNote}
            />
          </section>

          <section className="py-10">
            <div className="grid grid-cols-[1fr_auto] border-b border-[#17231d]/10 pb-3 text-[9px] font-extrabold tracking-[.14em] text-[#718078] uppercase">
              <span>Deskripsi</span>
              <span>Jumlah</span>
            </div>
            {projection.lines.map((line) => (
              <InvoiceRow
                key={`${line.item}-${line.amount}`}
                item={line.item}
                detail={line.detail}
                amount={line.amount}
              />
            ))}

            <div className="mt-7 ml-auto max-w-sm space-y-3 text-xs">
              <SummaryRow
                label="Subtotal produk"
                value={rupiah(productSubtotal)}
              />
              <SummaryRow label="Tip untuk kreator" value={rupiah(tip)} />
              <SummaryRow
                label={couponLabel}
                value={
                  couponDiscount > 0 ? `- ${rupiah(couponDiscount)}` : rupiah(0)
                }
                accent={couponDiscount > 0}
              />
              <SummaryRow
                label="Biaya platform pembeli"
                value={fee > 0 ? rupiah(fee) : "Rp0"}
              />
              <div className="flex items-end justify-between border-t border-[#17231d]/10 pt-4">
                <div>
                  <span className="text-sm font-extrabold">Total dibayar</span>
                  <p className="mt-1 text-[8px] text-[#718078]">
                    Termasuk seluruh komponen transaksi
                  </p>
                </div>
                <b className="text-2xl tracking-[-.04em]">{rupiah(total)}</b>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-6 rounded-[28px] bg-[#f1f4ed] p-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-xs font-extrabold">
                <BadgeCheck className="size-4 text-[#2e714f]" /> Pembayaran
                terverifikasi
              </p>
              <p className="mt-2 text-[9px] leading-5 text-[#65736b]">
                {projection.paymentSummary}
              </p>
              <div className="mt-4 flex items-center gap-2 text-[8px] font-bold text-[#47735b]">
                <FileCheck2 className="size-3.5" /> Signature:{" "}
                {projection.signatureLabel}
              </div>
            </div>
            {verificationUrl ? (
              <div className="rounded-2xl border border-[#dfe7dc] bg-white p-3 text-center shadow-sm">
                <canvas
                  ref={qrRef}
                  className="mx-auto size-32"
                  aria-label="QR verifikasi invoice"
                />
                <p className="mt-1 text-[7px] font-extrabold tracking-[.12em] text-[#718078] uppercase">
                  Scan untuk verifikasi
                </p>
              </div>
            ) : null}
          </section>

          {verificationUrl ? (
            <p className="mt-3 text-center font-mono text-[7px] break-all text-[#7d8881]">
              {verificationUrl}
            </p>
          ) : (
            <p className="mt-3 text-center font-mono text-[7px] break-all text-[#7d8881]">
              Order {displayOrderId}
            </p>
          )}

          <footer className="mt-16 flex items-end justify-between border-t border-[#17231d]/10 pt-6">
            <p className="max-w-lg text-[8px] leading-4 text-[#718078]">
              Invoice elektronik ini diterbitkan oleh Fersaku untuk transaksi
              produk digital. Nomor invoice, nilai pembayaran, dan signature
              verifikasi bersifat immutable pada sistem production. Simpan
              dokumen ini sebagai bukti pembayaran dan reimbursement.
            </p>
            <Printer className="size-5 shrink-0 text-[#718078]" />
          </footer>
        </div>
      </article>
    </main>
  );
}

function InvoiceRow({
  item,
  detail,
  amount,
}: {
  item: string;
  detail: string;
  amount: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] border-b border-[#17231d]/10 py-5">
      <div>
        <b className="text-sm">{item}</b>
        <p className="mt-1 text-[9px] text-[#718078]">{detail}</p>
      </div>
      <b className="text-sm">{rupiah(amount)}</b>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#647169]">{label}</span>
      <b className={accent ? "text-[#2d714e]" : ""}>{value}</b>
    </div>
  );
}

function Info({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <p className="text-[8px] font-extrabold tracking-[.14em] text-[#718078] uppercase">
        {label}
      </p>
      <b className="mt-2 block text-xs">{value}</b>
      <p className="mt-2 text-[9px] leading-5 whitespace-pre-line text-[#718078]">
        {note}
      </p>
    </div>
  );
}
