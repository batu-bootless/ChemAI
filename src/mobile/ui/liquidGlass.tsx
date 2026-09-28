"use client";

// Chem+ app: liquid glass (iOS 26) for any pane or button - the tab bar lens's refraction
// (liquidLens.ts) at the element's own size. The view behind the element is bent towards its rim,
// a little apart by colour as thick glass does, then softly blurred: a clear drop, not frost.
// Where the WebView cannot filter a backdrop through SVG, the element keeps its CSS blur.

import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { DISPERSION, lensMap, type LensShape } from "@/mobile/ui/liquidLens";

let refracts: boolean | null = null;

/** Whether the WebView bends a backdrop through an SVG filter (Chromium does). */
function canRefract(): boolean {
  if (refracts === null) refracts = typeof CSS !== "undefined" && CSS.supports("backdrop-filter", "url(#glass)");
  return refracts;
}

export interface GlassOptions extends LensShape {
  /** The blur after the bending, in px. */
  blur?: number;
  saturate?: number;
}

export interface LiquidGlass<T extends HTMLElement> {
  /** The element's ref callback. */
  bind: (element: T | null) => void;
  /** The element's backdrop-filter, once its size is known (none before, so hydration matches). */
  style: CSSProperties | undefined;
  /** The SVG filter the backdrop-filter points at: render it inside the element. */
  filter: ReactNode;
}

export function useLiquidGlass<T extends HTMLElement>({ blur = 6, saturate = 1.6, magnify, rimStart, rimReach, radius }: GlassOptions = {}): LiquidGlass<T> {
  const [element, setElement] = useState<T | null>(null);
  const [[width, height], setSize] = useState<[number, number]>([0, 0]);
  const id = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // The layout size (transforms aside), at most once a frame while it animates.
  useEffect(() => {
    if (!element) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next: [number, number] = [element.offsetWidth, element.offsetHeight];
        setSize((current) => (current[0] === next[0] && current[1] === next[1] ? current : next));
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [element]);

  const map = useMemo(
    () => (canRefract() ? lensMap(width, height, { magnify, rimStart, rimReach, radius }) : null),
    [width, height, magnify, rimStart, rimReach, radius]
  );
  const backdrop = map ? `url(#${id}) blur(${blur}px) saturate(${saturate})` : undefined;

  return {
    bind: setElement,
    style: backdrop ? { backdropFilter: backdrop, WebkitBackdropFilter: backdrop } : undefined,
    filter: map ? (
      <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
        <filter id={id} x="0" y="0" width={width} height={height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feImage href={map.href} x="0" y="0" width={width} height={height} preserveAspectRatio="none" result="map" />
          {DISPERSION.map((factor, index) => (
            <feDisplacementMap
              key={factor}
              in="SourceGraphic"
              in2="map"
              scale={map.scale * factor}
              xChannelSelector="R"
              yChannelSelector="G"
              result={`bent${index}`}
            />
          ))}
          <feColorMatrix in="bent0" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
          <feColorMatrix in="bent1" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
          <feColorMatrix in="bent2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
          <feBlend in="red" in2="green" mode="screen" result="redGreen" />
          <feBlend in="redGreen" in2="blue" mode="screen" />
        </filter>
      </svg>
    ) : null,
  };
}
