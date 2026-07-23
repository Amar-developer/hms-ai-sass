import { createRoot } from "react-dom/client";
import type { ApiSession } from "@/lib/api";
import Invoice from "./components/Invoice";
import { exportInvoicePdf } from "./exportInvoicePdf";
import { invoiceReceiptFilename, loadInvoiceReceiptProps } from "./invoiceReceiptData";

/**
 * Builds the invoice receipt and saves it as a PDF directly, without ever
 * navigating to (or opening a tab for) the printable invoice page. The
 * invoice markup is rendered into an off-screen container so html2canvas has
 * real layout to capture from.
 */
export async function downloadInvoiceReceipt(
  invoiceId: string,
  session: ApiSession,
): Promise<void> {
  const { props, release } = await loadInvoiceReceiptProps(invoiceId, session);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "-10000px";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    await new Promise<void>((resolve) => {
      root.render(<Invoice {...props} />);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await document.fonts?.ready;
    await Promise.all(
      Array.from(container.querySelectorAll("img")).map((img) =>
        img.complete ? Promise.resolve() : img.decode().catch(() => undefined),
      ),
    );
    await exportInvoicePdf(container, invoiceReceiptFilename(props));
  } finally {
    root.unmount();
    container.remove();
    release();
  }
}
