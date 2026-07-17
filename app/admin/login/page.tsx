import { Suspense } from "react";
import { AdminLogin } from "@/features/admin/components/admin-shell";
import { AuthEntryGuard } from "@/shared/auth/route-guard";

export default function AdminLoginPage() {
  return (
    <AuthEntryGuard surface="admin">
      <Suspense fallback={null}>
        <AdminLogin />
      </Suspense>
    </AuthEntryGuard>
  );
}
