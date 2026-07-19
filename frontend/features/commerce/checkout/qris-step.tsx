"use client";

import { useEffect, useRef } from "react";
import { Check, LoaderCircle, QrCode, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { rupiah } from "@/lib/utils";
import { wallets } from "./pieces";

export function CheckoutQrisStep({
  total,
  time,
  wallet,
  setWallet,
  notification,
  setNotification,
  paying,
  onPay,
  onBack,
  /** Live QR string from server intent (CHK-120); never logged. */
  qrString,
  qrImageUrl,
}: {
  total: number;
  time: string;
  wallet: string;
  setWallet: (value: string) => void;
  notification: boolean;
  setNotification: (value: boolean) => void;
  paying: boolean;
  onPay: () => void;
  onBack: () => void;
  qrString?: string | null;
  qrImageUrl?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!qrString || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, qrString, {
      width: 160,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#17231d", light: "#ffffff" },
    }).catch(() => {
      // Fail closed: keep chrome; do not invent success.
    });
  }, [qrString]);

  return (
    <div className="text-center">
      <p className="text-[10px] font-extrabold tracking-[.15em] text-[#718078] uppercase">
        QRIS payment simulator
      </p>
      <h2 className="font-display mt-2 text-4xl">Pilih e-wallet, lalu scan.</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-[1fr_170px] sm:items-center">
        <div>
          <div className="hairline shadow-card mx-auto grid aspect-square max-w-56 place-items-center rounded-[28px] border bg-white">
            <div className="relative">
              {qrImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- provider QR URL; no next/image domain allowlist
                <img
                  src={qrImageUrl}
                  alt=""
                  width={160}
                  height={160}
                  className="size-40 object-contain"
                />
              ) : qrString ? (
                <canvas
                  ref={canvasRef}
                  className="size-40"
                  width={160}
                  height={160}
                />
              ) : (
                <>
                  <QrCode
                    className="size-40 text-[#17231d]"
                    strokeWidth={1.2}
                  />
                  <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-[#173f2c] text-xs font-black text-[#d7ff64]">
                    F
                  </span>
                </>
              )}
            </div>
          </div>
          <p className="mt-4 text-2xl font-extrabold">{rupiah(total)}</p>
          <p className="mt-1 text-[10px] text-[#718078]">
            QR berlaku <b className="text-[#b2573c]">{time}</b>
          </p>
        </div>
        <div className="relative mx-auto h-[310px] w-[158px] overflow-hidden rounded-[28px] border-[6px] border-[#17231d] bg-[#edf0e9] shadow-2xl">
          <div className="mx-auto h-4 w-16 rounded-b-xl bg-[#17231d]" />
          <div className="p-3 text-left">
            <p className="text-[6px] font-bold text-[#718078]">
              12:42 • Simulator
            </p>
            <div className="mt-5 rounded-2xl bg-white p-3">
              <span
                className="grid size-8 place-items-center rounded-xl text-[7px] font-black text-white"
                style={{
                  backgroundColor: wallets.find((x) => x.name === wallet)
                    ?.color,
                }}
              >
                {wallet}
              </span>
              <p className="mt-3 text-[7px] font-black">Bayar Fersaku</p>
              <p className="mt-1 text-[11px] font-black">{rupiah(total)}</p>
            </div>
            {notification && (
              <div className="ewallet-notification absolute top-7 right-2 left-2 rounded-xl bg-[#17231d] p-3 text-white shadow-xl">
                <p className="text-[6px] font-black">{wallet} • sekarang</p>
                <p className="mt-1 text-[7px] leading-3">
                  Pembayaran {rupiah(total)} ke Fersaku berhasil!
                </p>
              </div>
            )}
          </div>
          <div className="absolute bottom-3 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-[#17231d]" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-4 gap-2">
        {wallets.map((item) => (
          <button
            key={item.name}
            onClick={() => {
              setWallet(item.name);
              setNotification(false);
            }}
            className={`rounded-xl border py-2.5 text-[8px] font-extrabold ${wallet === item.name ? "border-[#173f2c] bg-[#eff3e9]" : "hairline bg-white"}`}
          >
            {item.name}
          </button>
        ))}
      </div>
      <button
        onClick={onPay}
        disabled={paying}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white"
      >
        {paying ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Smartphone className="size-4" />
        )}
        {paying ? `Membuka ${wallet} simulator...` : `Bayar dengan ${wallet}`}
      </button>
      <button
        onClick={onBack}
        className="mt-4 text-[10px] font-bold text-[#718078]"
      >
        Ubah detail pesanan
      </button>
    </div>
  );
}

export function CheckoutPaidStep() {
  return (
    <div className="py-10 text-center">
      <span className="mx-auto grid size-20 place-items-center rounded-full bg-[#d7ff64]">
        <Check className="size-9 text-[#173f2c]" />
      </span>
      <h2 className="font-display mt-6 text-5xl">Pembayaran berhasil!</h2>
      <p className="mt-3 text-sm leading-6 text-[#718078]">
        Receipt dikirim ke email. Menyiapkan akses produk dan invoice...
      </p>
      <LoaderCircle className="mx-auto mt-6 size-5 animate-spin" />
    </div>
  );
}
