export function userInitials(user: any, email: string) {
  const source = String(user?.name || email || "User").trim();
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  return (
    (parts[0]?.[0] || "U").toUpperCase() +
    ((parts[1]?.[0] || "") as string).toUpperCase()
  );
}