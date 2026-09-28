import { downloadBlob as hostDownloadBlob } from "@/lib/workspace/frameBridge";

// Chem+ app: turns a self-contained HTML document into a downloadable A4 PDF.
//
// The document is written into a hidden same-origin iframe, which isolates it from the app's
// Tailwind v4 oklch() colours (html2canvas cannot parse those), rasterised, then sliced into A4
// pages. Rasterising is also what makes Turkish characters come out right: jsPDF's built-in fonts
// are Latin-1 and have no ş, ğ or ı, so text drawn directly would lose them.
//
// The HTML passed in must therefore be self-contained and use hex colours only.
//
// This was the lab notebook's report exporter; it moved here when the experiment-report module
// needed the same thing, and the notebook now calls it too.
export async function htmlToPdf(html: string, fileName: string): Promise<void> {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const html2canvas = html2canvasMod.default;

  const A4_PX_WIDTH = 794; // 210mm @ 96dpi
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_PX_WIDTH}px;height:1123px;border:0;background:#fff;`;
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument;
    if (!idoc) throw new Error("iframe document unavailable");
    idoc.open();
    idoc.write(html);
    idoc.close();

    // Wait for the document and any images it carries.
    await new Promise<void>((resolve) => {
      if (idoc.readyState === "complete") resolve();
      else iframe.addEventListener("load", () => resolve(), { once: true });
    });
    await Promise.all(
      Array.from(idoc.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((r) => {
              img.onload = img.onerror = () => r();
            })
      )
    );
    await new Promise((r) => setTimeout(r, 120));

    const target = idoc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: A4_PX_WIDTH,
      windowHeight: target.scrollHeight,
      width: A4_PX_WIDTH,
      height: target.scrollHeight,
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH, undefined, "FAST");
    let remaining = imgH - pageH;
    while (remaining > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH, undefined, "FAST");
      remaining -= pageH;
    }

    hostDownloadBlob(fileName, pdf.output("blob"));
  } finally {
    iframe.remove();
  }
}
