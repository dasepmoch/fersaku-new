import { compactRupiah, currencyRupiah } from "@/shared/format/money";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export { compactRupiah, currencyRupiah as rupiah };
