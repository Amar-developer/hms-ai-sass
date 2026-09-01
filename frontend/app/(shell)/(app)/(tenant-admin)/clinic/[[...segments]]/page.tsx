// SuperAdminDashboard/TenantAdmin are rendered by ../layout.tsx, not here —
// see the comment there. Layouts persist across navigations within
// /clinic/** (only their params update), while pages are recreated on every
// navigation, so rendering them from this page caused a full remount (and
// the tenant-selection reset it caused for super admins) on every
// list-to-edit navigation.
export default function ClinicSegmentsPage() {
  return null;
}
