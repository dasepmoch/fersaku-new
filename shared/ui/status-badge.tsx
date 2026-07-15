import { statusTone } from "./styles";

const positive = new Set(["Paid", "Active", "Completed", "Delivered"]);
const pending = new Set(["Pending", "Processing"]);

export function StatusBadge({ status }: { status: string }) {
  const tone = positive.has(status)
    ? statusTone.positive
    : pending.has(status)
      ? statusTone.pending
      : statusTone.negative;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-extrabold ${tone}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
