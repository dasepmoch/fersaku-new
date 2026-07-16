import {
  isSellerPendingStatus,
  isSellerPositiveStatus,
} from "@/shared/format/status";
import { statusTone } from "./styles";

export function StatusBadge({ status }: { status: string }) {
  const tone = isSellerPositiveStatus(status)
    ? statusTone.positive
    : isSellerPendingStatus(status)
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
