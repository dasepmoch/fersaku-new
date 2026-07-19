"use client";

import { Check, Loader2, Star } from "lucide-react";
import { useState } from "react";
import {
  isBuyerReviewApiDomain,
  useCreateBuyerReviewMutation,
  usePatchBuyerReviewMutation,
  type BuyerReview,
} from "@/features/buyer/data";
import { getDomainSource } from "@/shared/data/domain-source";

export type BuyerReviewCardProps = {
  product: string;
  /** Primary order item id for create (required in api mode). */
  orderItemId?: string;
  productId?: string;
  orderId?: string;
  /** Existing review when already submitted (server snapshot). */
  existingReview?: BuyerReview | null;
};

export function BuyerReviewCard({
  product,
  orderItemId,
  productId,
  orderId,
  existingReview = null,
}: BuyerReviewCardProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existingReview?.rating ?? 5);
  const [title, setTitle] = useState(existingReview?.title ?? "");
  const [body, setBody] = useState(existingReview?.body ?? "");
  const [submitted, setSubmitted] = useState(Boolean(existingReview));
  const [serverReview, setServerReview] = useState<BuyerReview | null>(
    existingReview,
  );
  const createMutation = useCreateBuyerReviewMutation();
  const patchMutation = usePatchBuyerReviewMutation();
  const busy = createMutation.isPending || patchMutation.isPending;
  const mockMode = getDomainSource("buyer") === "mock";
  const apiMode = isBuyerReviewApiDomain();
  const canSubmit =
    mockMode ||
    (apiMode && Boolean(orderItemId || serverReview?.id));

  if (submitted)
    return (
      <div className="mt-6 rounded-2xl border border-[#cde0a9] bg-[#eef8e4] p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[#d7ff64]">
            <Check className="size-4" />
          </span>
          <div>
            <b className="block text-[10px]">Ulasanmu sudah dikirim</b>
            <span className="text-[8px] text-[#65736b]">
              Ulasan terverifikasi akan tampil setelah pemeriksaan otomatis.
            </span>
          </div>
        </div>
      </div>
    );
  return (
    <div className="hairline mt-6 rounded-2xl border bg-[#f7f7f3] p-5">
      <div className="flex items-center">
        <div>
          <b className="block text-[10px]">Bagaimana pengalamanmu?</b>
          <span className="mt-1 block text-[8px] text-[#718078]">
            Ulasan hanya tersedia untuk pembelian terverifikasi.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="hairline ml-auto rounded-lg border bg-white px-3 py-2 text-[8px] font-bold"
        >
          {open ? "Tutup" : "Tulis ulasan"}
        </button>
      </div>
      {open && (
        <div className="hairline mt-5 border-t pt-5">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                disabled={busy}
              >
                <Star
                  className={`size-6 text-[#e8a72e] ${star <= rating ? "fill-current" : "opacity-25"}`}
                />
              </button>
            ))}
          </div>
          <input
            placeholder="Judul singkat"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            className="hairline mt-4 h-10 w-full rounded-xl border bg-white px-3 text-[9px] outline-none"
          />
          <textarea
            rows={4}
            placeholder={`Ceritakan pengalamanmu menggunakan ${product}...`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={busy}
            className="hairline mt-3 w-full resize-none rounded-xl border bg-white p-3 text-[9px] outline-none"
          />
          <label className="mt-3 flex items-center gap-2 text-[8px] text-[#718078]">
            <input type="checkbox" disabled={busy} /> Tampilkan nama sebagai
            anonim
          </label>
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => {
              void (async () => {
                if (mockMode) {
                  setSubmitted(true);
                  return;
                }
                if (!apiMode) return;
                try {
                  if (serverReview?.id) {
                    const review = await patchMutation.mutateAsync({
                      reviewId: serverReview.id,
                      expectedVersion: serverReview.contentVersion,
                      rating,
                      title,
                      body,
                      orderId,
                      productId: productId || serverReview.productId,
                      orderItemId: orderItemId || serverReview.orderItemId,
                    });
                    setServerReview(review);
                    setSubmitted(true);
                    return;
                  }
                  if (!orderItemId) return;
                  const review = await createMutation.mutateAsync({
                    orderItemId,
                    rating,
                    title,
                    body,
                    productId,
                    orderId,
                  });
                  setServerReview(review);
                  setSubmitted(true);
                } catch {
                  // 409/errors: keep typed title/body/rating; no optimistic submit.
                }
              })();
            }}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[9px] font-extrabold text-white disabled:opacity-70"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Kirim ulasan {rating} bintang
          </button>
        </div>
      )}
    </div>
  );
}

export function ProfileField({
  label,
  value,
  onChange,
  readOnly = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2 text-[10px] font-extrabold">
      {label}
      <input
        value={value}
        readOnly={readOnly || !onChange}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="hairline h-11 rounded-xl border bg-white px-3 text-[10px] font-normal outline-none disabled:opacity-60"
      />
    </label>
  );
}
export function Preference({
  title,
  desc,
  value,
  onChange,
}: {
  title: string;
  desc: string;
  value: boolean;
  onChange?: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-[#f5f5f0] p-4">
      <div>
        <b className="block text-[9px]">{title}</b>
        <span className="mt-1 block text-[8px] text-[#718078]">{desc}</span>
      </div>
      <button
        disabled={!onChange}
        onClick={onChange}
        className={`relative h-6 w-11 shrink-0 rounded-full ${value ? "bg-[#173f2c]" : "bg-[#c9cec9]"} disabled:opacity-60`}
      >
        <span
          className={`absolute top-1 size-4 rounded-full bg-white transition ${value ? "left-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}
