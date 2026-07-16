export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      {children}
    </label>
  );
}

export type CheckoutStep = "details" | "qris" | "paid";

export const wallets = [
  { name: "GoPay", color: "#00aed6" },
  { name: "OVO", color: "#6c2dbd" },
  { name: "DANA", color: "#1688f8" },
  { name: "ShopeePay", color: "#ee4d2d" },
];
