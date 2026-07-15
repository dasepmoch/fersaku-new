import { compactRupiah } from "@/lib/utils";

/** Matches the product UI style: `Rp18.240.500` (no narrow/no-break space). */
export function rupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export function formatSignedRupiah(
  amount: number,
  direction: "CREDIT" | "DEBIT",
) {
  const absolute = rupiah(Math.abs(amount));
  return direction === "CREDIT" ? `+ ${absolute}` : `- ${absolute}`;
}

export { compactRupiah };
