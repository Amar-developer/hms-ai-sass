const { chromium } = require("playwright");

const url = process.argv[2] || "http://localhost:3100/billing/invoices/receipt/dev-preview";
const pdfOut = process.argv[3] || "out.pdf";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("BODY TEXT SNIPPET:", bodyText);
  await page.screenshot({ path: "debug.png", fullPage: true });
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    function rect(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    }
    const results = [];
    document.querySelectorAll(".invoice-print > div > div").forEach((pageEl, i) => {
      const itemsBox = pageEl.querySelector("table")?.closest("div");
      const table = pageEl.querySelector("table");
      const totalWordsDiv = Array.from(pageEl.querySelectorAll("div")).find(d => d.textContent.includes("Total in words"));
      const dateSpan = Array.from(pageEl.querySelectorAll("span")).find(s => s.textContent.includes("Date:"));
      const bankHeader = Array.from(pageEl.querySelectorAll("h2")).find(h => h.textContent.includes("Bank Details"));
      const authSig = Array.from(pageEl.querySelectorAll("p")).find(p => p.textContent.includes("Authorized Signature"));
      results.push({
        pageIndex: i,
        pageRect: rect(pageEl),
        itemsBoxRect: rect(itemsBox),
        tableRect: rect(table),
        totalWordsRect: rect(totalWordsDiv),
        dateRect: rect(dateSpan),
        bankHeaderRect: rect(bankHeader),
        authSigRect: rect(authSig),
      });
    });
    return { results, docHeight: document.documentElement.scrollHeight };
  });
  console.log(JSON.stringify(info, null, 2));

  await page.pdf({ path: pdfOut, format: "A4", printBackground: true });
  const fs = require("fs");
  const buf = fs.readFileSync(pdfOut);
  const matches = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  console.log("PDF page count (approx):", matches ? matches.length : -1);

  await browser.close();
})();
