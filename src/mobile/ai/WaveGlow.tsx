"use client";

// Chem+ app: Iris's light - a soft blue glow rising from the bottom of the chat, its top a slow
// swell of waves (as in Gemini). It breathes calmly while the chat waits and quickens, rising a
// little, while Iris is answering.
//
// Three wave layers are drawn on a small canvas (a third of the screen's CSS pixels) and blurred
// there; the browser's smooth upscaling does the rest, so the light has no edges and costs little.
// About 30 frames a second is plenty for something this slow.

import { useEffect, useRef } from "react";

interface Layer {
  /** The wave's middle line, as a share of the height from the top. */
  base: number;
  /** Its height, as a share of the height. */
  swell: number;
  /** Its length, in widths. */
  length: number;
  /** Radians a second at rest (negative: it moves the other way). */
  speed: number;
  phase: number;
  rgb: [number, number, number];
  alpha: number;
}

const LAYERS: Layer[] = [
  { base: 0.32, swell: 0.06, length: 1.5, speed: 0.3, phase: 0, rgb: [204, 222, 252], alpha: 0.8 },
  { base: 0.5, swell: 0.055, length: 1.15, speed: -0.38, phase: 2.2, rgb: [176, 204, 250], alpha: 0.75 },
  { base: 0.68, swell: 0.05, length: 1.8, speed: 0.46, phase: 4.1, rgb: [136, 178, 246], alpha: 0.85 },
];

/** CSS pixels per canvas pixel. */
const SCALE = 3;
/** The blur inside the canvas, in canvas pixels (× SCALE on screen). */
const BLUR = 7;
/** How much faster the waves move while Iris answers, and how much higher the light rises. */
const ACTIVE_SPEED = 3.2;
const ACTIVE_LIFT = 0.07;

export default function WaveGlow({ active, still = false }: { active: boolean; still?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    // Where the canvas cannot blur itself, the element is blurred instead.
    const selfBlur = "filter" in context;
    canvas.style.filter = selfBlur ? "" : `blur(${BLUR * SCALE}px)`;

    let width = 1;
    let height = 1;
    let time = 0;
    let speed = activeRef.current ? ACTIVE_SPEED : 1;
    let lift = activeRef.current ? ACTIVE_LIFT : 0;
    let last = performance.now();
    let drawn = 0;
    let frame = 0;

    const draw = () => {
      context.clearRect(0, 0, width, height);
      if (selfBlur) context.filter = `blur(${BLUR}px)`;
      // A pale wash under the waves, so the light fades up into the page without a line.
      const wash = context.createLinearGradient(0, height * 0.2, 0, height);
      wash.addColorStop(0, "rgba(214, 228, 253, 0)");
      wash.addColorStop(1, "rgba(176, 204, 250, 0.95)");
      context.fillStyle = wash;
      context.fillRect(-BLUR * 3, 0, width + BLUR * 6, height + BLUR * 3);
      const margin = BLUR * 3;
      for (const layer of LAYERS) {
        const base = (layer.base - lift) * height;
        const swell = layer.swell * height;
        const shift = time * layer.speed + layer.phase;
        context.beginPath();
        context.moveTo(-margin, height + margin);
        for (let x = -margin; x <= width + margin; x += 2) {
          const u = x / width;
          const y =
            base +
            swell *
              (0.75 * Math.sin((2 * Math.PI * u) / layer.length + shift) +
                0.25 * Math.sin((2 * Math.PI * u) / (layer.length * 0.6) - shift * 1.3 + layer.phase * 1.7));
          context.lineTo(x, y);
        }
        context.lineTo(width + margin, height + margin);
        context.closePath();
        const [r, g, b] = layer.rgb;
        const fill = context.createLinearGradient(0, base - swell, 0, height);
        fill.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${layer.alpha * 0.55})`);
        fill.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${layer.alpha})`);
        context.fillStyle = fill;
        context.fill();
      }
      if (selfBlur) context.filter = "none";
    };

    // A new size clears the canvas: it is drawn again at once.
    const resize = () => {
      width = Math.max(1, Math.round(canvas.offsetWidth / SCALE));
      height = Math.max(1, Math.round(canvas.offsetHeight / SCALE));
      canvas.width = width;
      canvas.height = height;
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Off screen (the home page scrolled down), the light rests.
    let visible = true;
    const tick = (now: number) => {
      if (!visible) {
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
      const seconds = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Calm to quick (and back) over a second or so, never with a jump.
      const target = activeRef.current ? ACTIVE_SPEED : 1;
      speed += (target - speed) * Math.min(1, seconds * 1.2);
      lift += ((activeRef.current ? ACTIVE_LIFT : 0) - lift) * Math.min(1, seconds * 1.2);
      time += seconds * speed;
      if (now - drawn < 30) return;
      drawn = now;
      draw();
    };

    const onScreen = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible && !still && frame === 0) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    });
    onScreen.observe(canvas);

    if (!still) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      onScreen.disconnect();
    };
  }, [still]);

  return <canvas ref={canvasRef} aria-hidden="true" className="block size-full" />;
}
