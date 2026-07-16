/** Matches the product UI style: `Rp18.240.500` (no narrow/no-break space). */
export function rupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

/** Preserves the browser currency style used by public marketing/store pages. */
export function currencyRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function compactRupiah(value: number) {
  if (value >= 1_000_000) {
    return `Rp${(value / 1_000_000).toLocaleString("id-ID", {
      maximumFractionDigits: 1,
    })}jt`;
  }
  return `Rp${(value / 1_000).toLocaleString("id-ID")}rb`;
}

export function formatSignedRupiah(
  amount: number,
  direction: "CREDIT" | "DEBIT",
) {
  const absolute = rupiah(Math.abs(amount));
  return direction === "CREDIT" ? `+ ${absolute}` : `- ${absolute}`;
}
