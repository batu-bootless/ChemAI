// Chem+ app: the refraction of the tab bar's moving lens (iOS 26 "Liquid Glass"). The lens is a
// clear convex drop: towards its rim the glass bends light from further out, so the icons and the
// page beside the lens are drawn into its edge - a little apart by colour. It is done with an SVG
// filter the lens uses as its backdrop-filter (Chromium, so the app's WebView, applies SVG filters
// there); this file draws the filter's displacement map for the lens's size.
//
// The filter moves pixels without smoothing them, so it only magnifies the view behind the bar a
// touch: the enlarged icon in the lens is drawn again (AppTabBar), sharp at any size.

/** How much the middle of the lens magnifies the view behind the bar. */
const MAGNIFY = 1.06;
/** Where the rim starts bending, as a share of the way from the middle to the outline. */
const RIM_START = 0.55;
/** How far beyond the outline the rim reaches, as a share of the lens's half height. */
const RIM_REACH = 0.4;
/** Red, green and blue are bent by slightly different amounts: the colour fringes at the rim. */
export const DISPERSION = [1, 1.06, 1.12] as const;

export interface LensMap {
  /** The map as a PNG data URL, for feImage. */
  href: string;
  /** feDisplacementMap's scale for the red channel: the map's full range in px. */
  scale: number;
}

/**
 * The displacement map of a lens `width` × `height` px (a pill, or a rounded rectangle with
 * `shape.radius`), drawn at the screen's pixel
 * density so the bending is smooth. Each pixel stores where the lens shows its backdrop from, as
 * an offset in px (red: x, green: y, 128 = none).
 */
export interface LensShape {
  /** How much the middle magnifies (1: not at all, only the rim bends). */
  magnify?: number;
  /** Where the rim starts bending, as a share of the corner radius in from the outline. */
  rimStart?: number;
  /** How far beyond the outline the rim reaches, as a share of the corner radius. */
  rimReach?: number;
  /** The corner radius in px; a pill (half the smaller side) when left out. */
  radius?: number;
}

export function lensMap(width: number, height: number, shape: LensShape = {}): LensMap | null {
  if (typeof document === "undefined") return null;
  if (width < 8 || height < 8) return null;
  const density = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const w = Math.round(width * density);
  const h = Math.round(height * density);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const a = width / 2;
  const b = height / 2;
  const radius = Math.min(a, b, shape.radius ?? Infinity);
  const magnifyBy = shape.magnify ?? MAGNIFY;
  const rimStart = shape.rimStart ?? RIM_START;
  const reach = (shape.rimReach ?? RIM_REACH) * radius;
  const offsets = new Float32Array(w * h * 2);
  let largest = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // In px of the page, from the lens's centre.
      const dx = (x + 0.5) / density - a;
      const dy = (y + 0.5) / density - b;
      // Distance to the pill's outline (negative inside) and the outline's outward direction.
      const qx = Math.abs(dx) - (a - radius);
      const qy = Math.abs(dy) - (b - radius);
      let distance: number;
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const length = Math.hypot(qx, qy);
        distance = length - radius;
        nx = (Math.sign(dx) * qx) / length;
        ny = (Math.sign(dy) * qy) / length;
      } else if (qx > qy) {
        distance = qx - radius;
        nx = Math.sign(dx);
      } else {
        distance = qy - radius;
        ny = Math.sign(dy);
      }
      if (distance > 0) continue;
      // 0 in the middle, 1 on the outline; the rim bends more and more towards the outline.
      const r = 1 + distance / radius;
      const t = Math.max(0, (r - rimStart) / (1 - rimStart));
      const rim = t * t * (3 - 2 * t) * t;
      const magnify = (1 / magnifyBy - 1) * (1 - rim);
      const ox = dx * magnify + nx * reach * rim;
      const oy = dy * magnify + ny * reach * rim;
      offsets[(y * w + x) * 2] = ox;
      offsets[(y * w + x) * 2 + 1] = oy;
      largest = Math.max(largest, Math.abs(ox), Math.abs(oy));
    }
  }

  const image = context.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    image.data[i * 4] = Math.round(128 + (offsets[i * 2] / largest) * 127);
    image.data[i * 4 + 1] = Math.round(128 + (offsets[i * 2 + 1] / largest) * 127);
    image.data[i * 4 + 2] = 128;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  // feDisplacementMap moves by scale × (value / 255 − 0.5); the map spans ±127 around 128.
  return { href: canvas.toDataURL("image/png"), scale: (largest * 255) / 127 };
}
