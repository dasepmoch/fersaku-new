import { AdminRoleBuilderScreen } from "@/features/admin/screens/access";

export default async function AdminRoleBuilderPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  return <AdminRoleBuilderScreen id={roleId} />;
}
