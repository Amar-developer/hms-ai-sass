export function splitList(value: any) {
  return String(value || "")
    .split(/\n|,(?=\s*[A-Za-z0-9])|\s+\|\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isReleased(order: any) {
  return ["result_ready", "report_delivered"].includes(
    String(order?.status || ""),
  );
}

export function isCancelled(order: any) {
  return String(order?.status || "") === "cancelled";
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
