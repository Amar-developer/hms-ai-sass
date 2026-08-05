"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { TenantAdmin } from "@/features/admin/TenantAdmin";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { sections } from "@/features/admin/constants";
import { canUseTenantAdminSection } from "@/features/admin/permissions";

const SECTION_IDS = sections.map(([id]) => id);

/**
 * One route matches every Tenant Admin screen (/admin/users,
 * /admin/users/new, /admin/users/{id}/edit, /admin/roles, ...) so
 * TenantAdmin stays mounted once across all of them — section/view/id come
 * from the URL segments below instead of internal component state, which
 * is what makes each screen bookmarkable/shareable and gives back/forward
 * correct behavior, without re-fetching admin data on every navigation.
 */
export default function AdminPage() {
  const ctx = useWorkspace();
  const router = useRouter();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];

  const defaultSection =
    sections.find(([id]) => canUseTenantAdminSection(id, ctx.apiSession?.user))?.[0] ||
    "users";

  const [rawSection, second, third] = segments;
  const section = SECTION_IDS.includes(rawSection as any)
    ? (rawSection as string)
    : defaultSection;
  // /admin/{section}/{id} (row click) opens a read-only "view" of the
  // record; /admin/{section}/{id}/edit (explicit Edit action) opens it for
  // editing. Same form component renders both — only whether its fields are
  // disabled differs (see TenantAdmin's `readOnly` wiring).
  const isEditPath = third === "edit";
  const isViewPath = Boolean(second) && second !== "new" && !third;
  const view = isEditPath
    ? "edit"
    : isViewPath
      ? "view"
      : second === "new"
        ? "create"
        : "list";
  const selectedId = view === "edit" || view === "view" ? second : "";

  useEffect(() => {
    if (segments.length === 0 || !SECTION_IDS.includes(rawSection as any)) {
      router.replace(`/admin/${defaultSection}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.join("/"), defaultSection]);

  return (
    <TenantAdmin {...ctx} section={section} view={view} selectedId={selectedId} />
  );
}
