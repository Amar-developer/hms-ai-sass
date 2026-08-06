import { apiBlob, type ApiSession, uploadAssetUrl } from "./api";

export type StoredImageFile = {
  id?: string;
  file_url?: string;
  file_name?: string;
  content_type?: string | null;
  category?: string | null;
  attached_to_doctype?: string | null;
  attached_to_field?: string | null;
  is_active?: boolean;
};

function isImageFile(file: StoredImageFile) {
  const contentType = String(file.content_type || "").toLowerCase();
  const name = String(file.file_name || file.file_url || "").toLowerCase();
  return contentType.startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp)$/.test(name);
}

export function invoiceLogoCandidates(
  configuredValue: unknown,
  files: StoredImageFile[] = [],
) {
  const configured = String(configuredValue || "").trim();
  const activeLogos = files.filter(
    (file) =>
      file.is_active !== false &&
      String(file.category || "").toLowerCase() === "logo" &&
      file.attached_to_doctype === "Tenant" &&
      isImageFile(file),
  );
  const rank = (file: StoredImageFile) => {
    if (configured && file.file_url === configured) return 0;
    const field = String(file.attached_to_field || "").toLowerCase();
    if (field === "invoice.logo_url" || field === "invoice_logo_url") return 1;
    if (field === "logo_url") return 2;
    return 3;
  };

  return activeLogos
    .map((file, index) => ({ file, index, rank: rank(file) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ file }) => file);
}

function imageLoads(url: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    // html2canvas (invoice PDF export) loads images in crossOrigin="anonymous"
    // mode to rasterize them into canvas. Checking the same way here means a
    // URL that merely *displays* (no-cors) but can't be read cross-origin
    // doesn't get reported as usable, only to fail later during export.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

export type ResolvedImageAsset = {
  url: string;
  release: () => void;
};

export async function resolveInvoiceLogoAsset(
  configuredValue: unknown,
  files: StoredImageFile[],
  session: ApiSession,
): Promise<ResolvedImageAsset> {
  try {
    const blob = await apiBlob("/files/invoice-logo", session);
    const objectUrl = URL.createObjectURL(blob);
    if (await imageLoads(objectUrl)) {
      return { url: objectUrl, release: () => URL.revokeObjectURL(objectUrl) };
    }
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Older backends and tenants without a registered logo use the fallbacks.
  }

  for (const file of invoiceLogoCandidates(configuredValue, files)) {
    if (!file.id) continue;
    try {
      const blob = await apiBlob(`/files/${encodeURIComponent(file.id)}/download`, session);
      const objectUrl = URL.createObjectURL(blob);
      if (await imageLoads(objectUrl)) {
        return { url: objectUrl, release: () => URL.revokeObjectURL(objectUrl) };
      }
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Continue to the next active tenant logo when an upload is stale.
    }
  }

  const directUrl = uploadAssetUrl(String(configuredValue || ""));
  if (directUrl && (await imageLoads(directUrl))) {
    return { url: directUrl, release: () => undefined };
  }
  return { url: "", release: () => undefined };
}
