import { RolePermissionMatrix } from "@/app/components/common/RolePermissionMatrix";

export function PermissionCheckboxes({
  permissions,
  selected,
  roleName,
  roleId,
  roleOptions,
  onRoleChange,
  showHeading = true,
}: any) {
  const catalog = [...(permissions || [])];
  const includesPlatformPermissions = catalog.some((permission: any) =>
    String(permission.key || "").startsWith("platform."),
  );

  return (
    <RolePermissionMatrix
      permissions={catalog}
      selected={selected}
      roleName={roleName}
      roleId={roleId}
      roleOptions={roleOptions}
      onRoleChange={onRoleChange}
      showHeading={showHeading}
      description="Enable the exact workflow actions this role may use. Manage grants administrative workflows where supported."
      scopeMessage={
        includesPlatformPermissions
          ? "Primary tenant scope: platform and tenant permissions are available."
          : "Customer tenant scope: tenant permissions only; platform permissions are excluded."
      }
    />
  );
}
