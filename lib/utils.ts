export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function compactRupiah(value: number) {
  if (value >= 1_000_000)
    return `Rp${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  return `Rp${(value / 1_000).toLocaleString("id-ID")}rb`;
}
