const MM_PER_PX = 25.4 / 96;

// PrescriptionDocument renders each page at a fixed 794x1040px — matches the
// clinic's printed letterhead layout, so the PDF page is sized to fit it
// exactly instead of forcing it into a standard A4 sheet (which would leave
// dead space below the shorter prescription page).
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1040;
const PAGE_WIDTH_MM = PAGE_WIDTH_PX * MM_PER_PX;
const PAGE_HEIGHT_MM = PAGE_HEIGHT_PX * MM_PER_PX;
const PAGE_MARGIN_MM = 6;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2;

/**
 * Renders each `[data-prescription-page]` element inside `container` to a
 * canvas and packs them into a downloadable PDF, the same way
 * exportInvoicePdf does for invoices. This bypasses window.print() entirely
 * so the browser's own print header/footer (date, page title, URL, page
 * number) never gets a chance to render, and the page gets a small margin
 * around the captured content instead of butting up against the PDF edge.
 */
export async function exportPrescriptionPdf(
  container: HTMLElement,
  filename: string,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const pageEls = Array.from(
    container.querySelectorAll<HTMLElement>("[data-prescription-page]"),
  );
  if (pageEls.length === 0) return;

  const pdf = new jsPDF({
    unit: "mm",
    format: [PAGE_WIDTH_MM, PAGE_HEIGHT_MM],
    orientation: "portrait",
  });

  for (let i = 0; i < pageEls.length; i += 1) {
    const canvas = await html2canvas(pageEls[i], {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      onclone: (clonedDoc: Document) => {
        const style = clonedDoc.createElement("style");
        style.textContent = `
          [data-prescription-page] {
            box-shadow: none !important;
            width: ${PAGE_WIDTH_PX}px !important;
            height: ${PAGE_HEIGHT_PX}px !important;
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
      canvas.toDataURL("image/png"),
      "PNG",
      PAGE_MARGIN_MM,
      PAGE_MARGIN_MM,
      CONTENT_WIDTH_MM,
      imageHeightMm,
    );
  }

  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
