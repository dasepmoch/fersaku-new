import { AdminConsoleFrame } from "@/features/admin/components/admin-console-frame";
import { PrivateSurfaceShell } from "@/shared/auth/private-surface-shell";

export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivateSurfaceShell surface="admin" requireMfaVerified>
      <AdminConsoleFrame>{children}</AdminConsoleFrame>
    </PrivateSurfaceShell>
  );
}
