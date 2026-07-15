import { AdminConsoleFrame } from "@/features/admin/components/admin-console-frame";

export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminConsoleFrame>{children}</AdminConsoleFrame>;
}
