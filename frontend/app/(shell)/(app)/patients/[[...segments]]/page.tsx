// The patient workspace itself is rendered by ../layout.tsx, not here — see
// the comment there. Layouts persist across navigations within /patients/**
// (only their params update), while pages are recreated on every
// navigation, so rendering <Patient> from this page caused a full
// remount — and the resulting data/loading flicker — on every tab switch.
export default function PatientsPage() {
  return null;
}
