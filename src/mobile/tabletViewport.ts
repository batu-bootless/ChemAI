/**
 * Tablets get the phone layout, scaled up - not a stretched one.
 *
 * The app ships a single design (src/mobile/layout.ts, plus the breakpoints pinned in
 * globals.css). Laid out across a tablet's 800-1300 CSS pixels that design would leave cards and
 * text lines far wider than they were drawn for, so the page is zoomed instead: everything scales
 * together, the fixed tab bar and the sheets included, and a tablet shows the phone screen at
 * tablet size.
 *
 * The zoom goes on the root element rather than the viewport meta tag: Next owns that tag (the
 * `viewport` export in src/app/layout.tsx) and restores its own value when the page hydrates,
 * which silently undid an earlier version of this. Zoom also keeps working when the device is
 * turned, because the layout width it produces is always the current width divided by the scale.
 *
 * Phones keep scale 1: their own width is already at or below PHONE_WIDTH.
 */
const PHONE_WIDTH = 430;   // the width the design is drawn for
const TABLET_FROM = 600;   // a device whose narrow side is at least this is a tablet
const MAX_SCALE = 1.8;     // how far the phone screen may be blown up

export function pinPhoneViewport(): void {
  if (typeof document === "undefined") return;

  // screen.* is the device's own size in CSS pixels and does not move with the zoom set here, so
  // re-running this cannot ratchet the page down.
  const narrow = Math.min(window.screen.width, window.screen.height);
  if (narrow < TABLET_FROM) return;

  const scale = Math.min(MAX_SCALE, Math.max(1, narrow / PHONE_WIDTH));
  document.documentElement.style.zoom = scale.toFixed(2);
  document.documentElement.dataset.appZoom = scale.toFixed(2);
}
