// SuperAdminDashboard is rendered by ../layout.tsx, not here — see the
// comment there. Layouts persist across navigations within /superadmin/**
// (only their params update), while pages are recreated on every
// navigation, so rendering it from this page caused a full remount (and the
// tenant-selection reset it caused) on every list-to-edit navigation.
export default function SuperAdminPage() {
  return null;
}
