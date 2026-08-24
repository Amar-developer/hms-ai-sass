export function canManageExpenseSubcategories(user: any) {
  const permissions = user?.permissions || [];
  if (
    user?.is_super_admin ||
    permissions.includes("*") ||
    user?.roles?.includes("tenant_admin") ||
    user?.user_type === "tenant_admin"
  ) {
    return true;
  }
  const matching = permissions.filter((permission: string) =>
    permission.startsWith("expense_subcategories."),
  );
  const isRead = (permission: string) => permission.split(".").at(-1) === "read";
  return matching.some(isRead) && matching.some((permission: string) => !isRead(permission));
}
