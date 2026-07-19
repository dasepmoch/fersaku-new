"use client";

import {
  adminPanel,
  Metric,
  TableToolbar,
  AdminStatus,
  ControlDialog,
} from "@/features/admin/ui";
import {
  useAdminReviews,
  useAdminReviewsModerateEnabled,
  useModerateAdminReviewMutation,
} from "@/features/admin/data";
import { createIdempotencyKey } from "@/shared/api/idempotency";

import { Star } from "lucide-react";

import { useRef, useState } from "react";

function ReviewModeration() {
  const canModerate = useAdminReviewsModerateEnabled();
  const { data } = useAdminReviews();
  const moderateMutation = useModerateAdminReviewMutation();
  const items = data ?? [];
  const [action, setAction] = useState<{
    title: string;
    reviewId: string;
    status: string;
    danger?: boolean;
  } | null>(null);
  const idemRef = useRef<string | null>(null);

  const update = async (id: string, status: string, reason: string) => {
    if (!canModerate) {
      throw new Error("Missing reviews.moderate permission");
    }
    const row = items.find((item) => item.id === id);
    if (!idemRef.current) {
      idemRef.current = createIdempotencyKey();
    }
    await moderateMutation.mutateAsync({
      reviewId: id,
      status,
      reason,
      productId: row?.productId,
      idempotencyKey: idemRef.current,
    });
    idemRef.current = null;
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          label="Published reviews"
          value="8.284"
          note="4.72 average rating"
        />
        <Metric
          label="Pending moderation"
          value={String(
            items.filter((i) => i.status === "Pending moderation").length,
          )}
          note="Oldest 18 minutes"
          tone="warning"
        />
        <Metric
          label="Reported by sellers"
          value="12"
          note="3 high priority"
          tone="danger"
        />
        <Metric
          label="Verified purchase"
          value="99.8%"
          note="Integrity coverage"
        />
      </div>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <TableToolbar placeholder="Search review, buyer, seller, or product..." />
        <div className="grid gap-3 p-4">
          {items.map((review) => (
            <article
              key={review.id}
              className="rounded-2xl border border-[#e1e5ed] bg-white p-5"
            >
              <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
                <div>
                  <div className="flex items-start">
                    <span className="grid size-9 place-items-center rounded-full bg-[#e8ecf7] text-[8px] font-black">
                      {review.initials}
                    </span>
                    <div className="ml-3">
                      <div className="flex items-center gap-2">
                        <b className="text-[9px]">{review.buyer}</b>
                        {review.verified && <AdminStatus status="Verified" />}
                      </div>
                      <p className="mt-1 text-[8px] text-[#7d879b]">
                        {review.product} • {review.seller} • {review.createdAt}
                      </p>
                    </div>
                    <AdminStatus status={review.status} />
                  </div>
                  <div className="mt-4 flex text-[#e8a72e]">
                    {[1, 2, 3, 4, 5].map((x) => (
                      <Star
                        key={x}
                        className={`size-3.5 ${x <= review.rating ? "fill-current" : "opacity-20"}`}
                      />
                    ))}
                  </div>
                  <h3 className="mt-3 text-[11px] font-black">
                    {review.title}
                  </h3>
                  <p className="mt-2 text-[9px] leading-5 text-[#7d879b]">
                    {review.body}
                  </p>
                  {review.sellerReply && (
                    <div className="mt-3 rounded-xl bg-[#f3f5f9] p-3">
                      <b className="text-[8px]">Seller reply</b>
                      <p className="mt-1 text-[8px] leading-4 text-[#7d879b]">
                        {review.sellerReply}
                      </p>
                    </div>
                  )}
                </div>
                <aside className="rounded-xl bg-[#f7f8fa] p-4">
                  <h4 className="text-[8px] font-black tracking-wider text-[#7d879b] uppercase">
                    Integrity signals
                  </h4>
                  <div className="mt-4 grid gap-3">
                    {[
                      ["Paid order matched", "Yes"],
                      ["Buyer email verified", "Yes"],
                      ["Account age", "116 days"],
                      ["Duplicate content", "No"],
                      [
                        "Abuse score",
                        review.rating <= 2 ? "42 / 100" : "4 / 100",
                      ],
                    ].map((x) => (
                      <div
                        key={x[0]}
                        className="flex justify-between text-[8px]"
                      >
                        <span className="text-[#7d879b]">{x[0]}</span>
                        <b>{x[1]}</b>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 grid gap-2">
                    <button
                      type="button"
                      disabled={!canModerate || moderateMutation.isPending}
                      onClick={() => {
                        if (!canModerate) return;
                        idemRef.current = null;
                        setAction({
                          title: `Approve and publish ${review.id}`,
                          reviewId: review.id,
                          status: "Published",
                        });
                      }}
                      className="h-9 rounded-lg bg-[#1d8b50] text-[8px] font-extrabold text-white disabled:opacity-50"
                    >
                      Approve & publish
                    </button>
                    <button
                      type="button"
                      disabled={!canModerate || moderateMutation.isPending}
                      onClick={() => {
                        if (!canModerate) return;
                        idemRef.current = null;
                        setAction({
                          title: `Request edit for ${review.id}`,
                          reviewId: review.id,
                          status: "Needs edit",
                        });
                      }}
                      className="h-9 rounded-lg border border-[#dce1e9] text-[8px] font-bold disabled:opacity-50"
                    >
                      Request buyer edit
                    </button>
                    <button
                      type="button"
                      disabled={!canModerate || moderateMutation.isPending}
                      onClick={() => {
                        if (!canModerate) return;
                        idemRef.current = null;
                        setAction({
                          title: `Remove review ${review.id}`,
                          reviewId: review.id,
                          status: "Removed",
                          danger: true,
                        });
                      }}
                      className="h-9 rounded-lg border border-[#efc8c4] bg-[#fff5f4] text-[8px] font-bold text-[#c6534c] disabled:opacity-50"
                    >
                      Remove review
                    </button>
                  </div>
                </aside>
              </div>
            </article>
          ))}
        </div>
      </section>
      {action && (
        <ControlDialog
          title={action.title}
          target={action.reviewId}
          danger={action.danger}
          auditHandledExternally
          onConfirm={(reason) => update(action.reviewId, action.status, reason)}
          onClose={() => {
            setAction(null);
            idemRef.current = null;
          }}
        />
      )}
    </>
  );
}

export { ReviewModeration as AdminReviewsScreen };
