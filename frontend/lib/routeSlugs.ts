/**
 * Generic create/edit URL segment helpers. Every module builds
 * "new-{slug}"/"edit-{slug}" (e.g. /clinic/users/new-user,
 * /clinic/users/{id}/edit-user) instead of the bare "new"/"edit" segments,
 * so the URL and breadcrumb self-describe which entity is being created or
 * edited. Parsing only needs the prefix — a route doesn't need to know the
 * exact slug to recognize "this segment is a create/edit segment".
 */
export function newSegment(slug: string): string {
  return `new-${slug}`;
}

export function editSegment(slug: string): string {
  return `edit-${slug}`;
}

export function isNewSegment(segment: string | undefined): boolean {
  return Boolean(segment && segment.startsWith("new-"));
}

export function isEditSegment(segment: string | undefined): boolean {
  return Boolean(segment && segment.startsWith("edit-"));
}
