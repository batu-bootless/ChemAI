// When a module runs inside the Multi-Pane Workspace it is hosted in a
// same-origin <iframe>. Mobile browsers frequently block <a download> clicks and
// window.open() that originate from a nested browsing context, so exports appear
// to "do nothing". Because the frame is same-origin we can perform the action in
// the TOP document instead — still inside the user's click gesture — which the
// browser treats as a top-level download/popup and allows.
//
// Outside the workspace (not framed) these behave exactly like the plain DOM
// approach, so callers can use them unconditionally.

function hostWindow(): Window {
  try {
    if (window.self !== window.top && window.top) {
      // Touch top.document to confirm same-origin access (throws if cross-origin).
      void window.top.document;
      return window.top;
    }
  } catch {
    /* cross-origin (shouldn't happen here) → fall back to current window */
  }
  return window;
}

/** Downloads a blob, performing the click in the top document when framed.
 *  Blob URLs are same-origin-scoped, so a URL created here is usable by the top
 *  document's anchor. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  triggerDownload(hostWindow(), fileName, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Downloads text content (creates the blob for you). */
export function downloadText(fileName: string, content: string, type = "text/plain"): void {
  downloadBlob(fileName, new Blob([content], { type }));
}

/** Downloads a direct href / data URI (e.g. an image data URL). */
export function downloadHref(fileName: string, href: string): void {
  triggerDownload(hostWindow(), fileName, href);
}

function triggerDownload(w: Window, fileName: string, href: string): void {
  const a = w.document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  w.document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Opens a blank popup from the top window (avoids in-frame popup blocking). */
export function openBlankWindow(target = "_blank", features = ""): Window | null {
  return hostWindow().open("", target, features);
}
