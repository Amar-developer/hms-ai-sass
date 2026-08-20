const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 6;
const CONTENT_WIDTH_MM = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2;
const CAPTURE_SCALE = 1.25;
const JPEG_QUALITY = 0.8;

/**
 * Renders each `[data-invoice-page]` element inside `container` to a canvas and
 * packs them into a downloadable PDF. This bypasses window.print() entirely so
 * the browser's own print header/footer (date, page title, URL, page number)
 * never gets a chance to render.
 *
 * The page's `print:min-h-[297mm]` sizing only ever applies under real
 * `@media print` (which html2canvas never triggers), so the clone gets that
 * same A4 sizing forced back on inline before capture — otherwise the source
 * element is only as tall as its content and the PDF ends up with dead space
 * below a short invoice.
 */
async function buildInvoicePdf(container: HTMLElement) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const pageEls = Array.from(
    container.querySelectorAll<HTMLElement>("[data-invoice-page]"),
  );
  if (pageEls.length === 0) return null;

  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
    compress: true,
  });

  for (let i = 0; i < pageEls.length; i += 1) {
    const canvas = await html2canvas(pageEls[i], {
      scale: CAPTURE_SCALE,
      backgroundColor: "#ffffff",
      useCORS: true,
      onclone: (clonedDoc: Document) => {
        const style = clonedDoc.createElement("style");
        style.textContent = `
          [data-invoice-page] {
            border-color: #25FF46 !important;
            box-shadow: none !important;
            width: ${A4_WIDTH_MM}mm !important;
            min-height: ${A4_HEIGHT_MM}mm !important;
            margin: 0 !important;
          }
        `;
        clonedDoc.head.appendChild(style);
      },
    });

    const imageHeightMm = Math.min(
      (canvas.height * CONTENT_WIDTH_MM) / canvas.width,
      CONTENT_HEIGHT_MM,
    );
    if (i > 0) pdf.addPage();
    pdf.addImage(
      canvas.toDataURL("image/jpeg", JPEG_QUALITY),
      "JPEG",
      PAGE_MARGIN_MM,
      PAGE_MARGIN_MM,
      CONTENT_WIDTH_MM,
      imageHeightMm,
      undefined,
      "MEDIUM",
    );
  }

  return pdf;
}

export async function renderInvoicePdfBlob(
  container: HTMLElement,
): Promise<Blob> {
  const pdf = await buildInvoicePdf(container);
  if (!pdf) throw new Error("Invoice PDF content could not be rendered.");
  const blob = pdf.output("blob");
  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (
    signature.length !== 4 ||
    signature[0] !== 0x25 ||
    signature[1] !== 0x50 ||
    signature[2] !== 0x44 ||
    signature[3] !== 0x46
  ) {
    throw new Error("Generated invoice PDF failed validation.");
  }
  return blob;
}

export async function exportInvoicePdf(
  container: HTMLElement,
  filename: string,
): Promise<void> {
  const pdf = await buildInvoicePdf(container);
  if (!pdf) return;
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
