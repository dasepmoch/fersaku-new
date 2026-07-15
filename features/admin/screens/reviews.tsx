"use client";

import {
  AlertTriangle,
  Check,
  FileDown,
  Filter,
  LockKeyhole,
  Search,
  Star,
  X,
} from "lucide-react";
import { useState } from "react";
import { reviews } from "@/lib/reviews-mock-data";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
function ReviewModeration() {
  const [items, setItems] = useState(reviews);
  const [action, setAction] = useState<string | null>(null);
  const update = (id: string, status: string) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );
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
      <section className={`${panel} mt-4 overflow-hidden`}>
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
                      onClick={() => update(review.id, "Published")}
                      className="h-9 rounded-lg bg-[#1d8b50] text-[8px] font-extrabold text-white"
                    >
                      Approve & publish
                    </button>
                    <button
                      onClick={() => setAction(`Request edit for ${review.id}`)}
                      className="h-9 rounded-lg border border-[#dce1e9] text-[8px] font-bold"
                    >
                      Request buyer edit
                    </button>
                    <button
                      onClick={() => update(review.id, "Removed")}
                      className="h-9 rounded-lg border border-[#efc8c4] bg-[#fff5f4] text-[8px] font-bold text-[#c6534c]"
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
        <ControlDialog title={action} onClose={() => setAction(null)} />
      )}
    </>
  );
}
function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className={`${panel} p-5`}>
      <p className="text-[8px] font-extrabold tracking-[.12em] text-[#818ca1] uppercase">
        {label}
      </p>
      <p className="mt-2 text-xl font-black tracking-[-.035em]">{value}</p>
      {note && (
        <p
          className={`mt-1 text-[8px] font-semibold ${tone === "danger" ? "text-[#d55850]" : tone === "warning" ? "text-[#d28a25]" : "text-[#788399]"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}
function TableToolbar({
  placeholder,
  inline = false,
}: {
  placeholder: string;
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? "w-full max-w-md"
          : "flex flex-col gap-3 border-b border-[#e5e8ef] p-4 sm:flex-row"
      }
    >
      <SearchInput placeholder={placeholder} />
      {!inline && (
        <div className="flex gap-2 sm:ml-auto">
          <SelectButton label="All statuses" />
          <button className="flex h-10 items-center gap-2 rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold">
            <Filter className="size-3.5" /> More filters
          </button>
          <button className="flex h-10 items-center gap-2 rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold">
            <FileDown className="size-3.5" /> Export
          </button>
        </div>
      )}
    </div>
  );
}
function SearchInput({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-10 w-full max-w-md items-center gap-2 rounded-xl border border-[#dce1e9] bg-white px-3 text-[#8590a4]">
      <Search className="size-3.5" />
      <input
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[9px] outline-none"
      />
    </div>
  );
}
function SelectButton({ label }: { label: string }) {
  return (
    <button className="h-10 rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold whitespace-nowrap text-[#667188]">
      {label}
    </button>
  );
}
function AdminStatus({ status }: { status: string }) {
  const positive = [
    "Active",
    "Paid",
    "Completed",
    "Live",
    "Success",
    "Operational",
    "Delivered",
    "Available",
    "Sold",
    "Verified",
    "Fulfilled",
    "Published",
  ].includes(status);
  const pending = [
    "Pending",
    "Processing",
    "Invited",
    "On hold",
    "Review",
    "Reserved",
  ].includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[8px] font-extrabold whitespace-nowrap ${positive ? "bg-[#e9f7ef] text-[#287d4c]" : pending ? "bg-[#fff6e4] text-[#a16d1e]" : "bg-[#fff0ee] text-[#c9544d]"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
function ControlDialog({
  title,
  onClose,
  danger = false,
}: {
  title: string;
  onClose: () => void;
  danger?: boolean;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#080d1b]/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[24px] border border-white/10 bg-white p-6 shadow-2xl">
        {done ? (
          <div className="py-8 text-center">
            <span
              className={`mx-auto grid size-14 place-items-center rounded-full ${danger ? "bg-[#fff0ee] text-[#d25850]" : "bg-[#e9f7ef] text-[#287d4c]"}`}
            >
              <Check className="size-6" />
            </span>
            <h3 className="mt-4 text-lg font-black">Action recorded</h3>
            <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
              Mock operation completed and an immutable audit event was created.
            </p>
            <button
              onClick={onClose}
              className="mt-6 h-10 w-full rounded-xl bg-[#11182a] text-[9px] font-extrabold text-white"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start">
              <span
                className={`grid size-11 place-items-center rounded-xl ${danger ? "bg-[#fff0ee] text-[#d25850]" : "bg-[#edf1ff] text-[#5b7cfa]"}`}
              >
                {danger ? (
                  <AlertTriangle className="size-5" />
                ) : (
                  <LockKeyhole className="size-5" />
                )}
              </span>
              <button onClick={onClose} className="ml-auto">
                <X className="size-4" />
              </button>
            </div>
            <h3 className="mt-5 text-lg font-black tracking-[-.03em]">
              {title}
            </h3>
            <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
              This privileged operation will be attributed to your administrator
              account and stored in the audit trail.
            </p>
            <label className="mt-5 grid gap-2 text-[9px] font-extrabold">
              Reason for action
              <textarea
                rows={3}
                placeholder="Provide an operational reason..."
                className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[10px] font-normal outline-none focus:border-[#5b7cfa]"
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-[8px] text-[#737e93]">
              <input type="checkbox" /> I have reviewed the available evidence
              and understand the impact.
            </label>
            <div className="mt-6 flex gap-2">
              <button
                onClick={onClose}
                className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[9px] font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => setDone(true)}
                className={`h-10 flex-1 rounded-xl text-[9px] font-extrabold text-white ${danger ? "bg-[#ce544d]" : "bg-[#11182a]"}`}
              >
                Confirm action
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { ReviewModeration as AdminReviewsScreen };
