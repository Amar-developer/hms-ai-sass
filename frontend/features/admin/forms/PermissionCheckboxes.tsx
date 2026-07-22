import { RolePermissionMatrix } from "@/app/components/common/RolePermissionMatrix";

export function PermissionCheckboxes({
  permissions,
  selected,
  disabled,
  roleName,
  roleId,
  roleOptions,
  onRoleChange,
}: any) {
  return (
    <RolePermissionMatrix
      permissions={permissions}
      selected={selected}
      disabled={disabled}
      roleName={roleName}
      roleId={roleId}
      roleOptions={roleOptions}
      onRoleChange={onRoleChange}
      description="Assign module access by action. A sidebar module appears only when Read and at least one additional action are selected."
    />
  );
}
