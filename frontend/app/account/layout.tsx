import { BuyerAccountShell } from "@/shared/auth/buyer-account-shell";

/**
 * INT-120 — buyer private routes under /account/** (login/verify remain public via shell).
 */
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BuyerAccountShell>{children}</BuyerAccountShell>;
}
