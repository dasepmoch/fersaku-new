import { Code2, Layers3, Store } from "lucide-react";

export type FinanceSource = "STOREFRONT" | "QRIS_API" | "MIXED";

const sourceMeta = {
  STOREFRONT: {
    label: "Storefront",
    title: "Saldo dari checkout storefront Fersaku",
    icon: Store,
    className: "bg-[#eaf5e8] text-[#2f714f]",
  },
  QRIS_API: {
    label: "QRIS API",
    title: "Saldo dari payment gateway QRIS API",
    icon: Code2,
    className: "bg-[#edf1ff] text-[#536fdf]",
  },
  MIXED: {
    label: "Gabungan",
    title: "Menggunakan saldo Storefront dan QRIS API",
    icon: Layers3,
    className: "bg-[#fff4d7] text-[#8a681d]",
  },
} as const;

export function FinanceSourceBadge({
  source,
  className,
}: {
  source: FinanceSource;
  className?: string;
}) {
  const meta = sourceMeta[source];
  const Icon = meta.icon;
  return (
    <span
      title={meta.title}
      className={[
        "inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-[8px] font-extrabold whitespace-nowrap",
        meta.className,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
