"use client";

// ChemAI: a photo from the chat, full screen - pinch or scroll to zoom, drag to move around, double
// tap to zoom in on a spot (and again to fit), + / − / fit buttons. It closes with its button, a tap
// beside the photo, Escape, or the phone's back button (AppShell sends Escape to an open dialog).

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, X } from "lucide-react";
import { useL } from "@/mobile/i18n";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
const STEP = 1.5;

interface View {
  scale: number;
  x: number;
  y: number;
}

const FIT: View = { scale: 1, x: 0, y: 0 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function ImageViewer({ src, alt = "", onClose }: { src: string; alt?: string; onClose: () => void }) {
  const l = useL();
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(FIT);
  // The view as of the last change: gestures read it, not the rendered state, so fast events that
  // arrive before React has re-rendered (a finger lifted mid-pinch) start from where the photo is.
  const current = useRef<View>(FIT);
  const apply = useCallback((next: View | ((from: View) => View)) => {
    const value = typeof next === "function" ? next(current.current) : next;
    current.current = value;
    setView(value);
  }, []);
  const [moving, setMoving] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; mid: { x: number; y: number }; dist: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const moved = useRef(false);

  /** A point on screen relative to the stage's centre (the transform's origin). */
  const local = useCallback((clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    return box ? { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 } : { x: 0, y: 0 };
  }, []);

  /** Keeps the zoomed photo from being dragged off the screen. */
  const bounded = useCallback((next: View): View => {
    const box = stage.current?.getBoundingClientRect();
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    if (!box || scale <= 1) return { scale, x: 0, y: 0 };
    const maxX = (box.width * (scale - 1)) / 2;
    const maxY = (box.height * (scale - 1)) / 2;
    return { scale, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }, []);

  /** Zooms to `scale`, keeping the photo's point under `at` (stage-centred) where it is. */
  const zoomAt = useCallback(
    (from: View, scale: number, at: { x: number; y: number }): View => {
      const next = clamp(scale, MIN_SCALE, MAX_SCALE);
      return bounded({ scale: next, x: at.x - (next * (at.x - from.x)) / from.scale, y: at.y - (next * (at.y - from.y)) / from.scale });
    },
    [bounded]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "+" || event.key === "=") apply((v) => zoomAt(v, v.scale * STEP, { x: 0, y: 0 }));
      else if (event.key === "-") apply((v) => zoomAt(v, v.scale / STEP, { x: 0, y: 0 }));
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [apply, onClose, zoomAt]);

  const startGesture = () => {
    const from = current.current;
    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      gesture.current = { view: from, mid: local((a.x + b.x) / 2, (a.y + b.y) / 2), dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    } else if (points.length === 1) {
      gesture.current = { view: from, mid: local(points[0].x, points[0].y), dist: 0 };
    } else {
      gesture.current = null;
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // a pointer already gone: the gesture still works without capture
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) moved.current = false;
    setMoving(true);
    startGesture();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = gesture.current;
    if (!start) return;
    const points = [...pointers.current.values()];
    if (points.length >= 2 && start.dist > 0) {
      const [a, b] = points;
      const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      const scale = clamp(start.view.scale * (Math.hypot(a.x - b.x, a.y - b.y) / start.dist), MIN_SCALE, MAX_SCALE);
      // The photo's point under the fingers' first midpoint follows the midpoint as it moves.
      apply(bounded({ scale, x: mid.x - (scale * (start.mid.x - start.view.x)) / start.view.scale, y: mid.y - (scale * (start.mid.y - start.view.y)) / start.view.scale }));
      moved.current = true;
    } else if (points.length === 1) {
      const at = local(points[0].x, points[0].y);
      const dx = at.x - start.mid.x;
      const dy = at.y - start.mid.y;
      if (Math.hypot(dx, dy) > 6) moved.current = true;
      if (start.view.scale > 1) apply(bounded({ scale: start.view.scale, x: start.view.x + dx, y: start.view.y + dy }));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size > 0) {
      // One finger lifted from a pinch: the other carries on as a drag from here.
      startGesture();
      return;
    }
    gesture.current = null;
    setMoving(false);
    if (moved.current || event.type === "pointercancel") return;
    const now = Date.now();
    const tap = lastTap.current;
    if (tap && now - tap.time < 300 && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 30) {
      lastTap.current = null;
      apply((v) => (v.scale > 1.05 ? FIT : zoomAt(v, DOUBLE_TAP_SCALE, local(event.clientX, event.clientY))));
      return;
    }
    lastTap.current = { time: now, x: event.clientX, y: event.clientY };
    // A single tap beside the photo, not zoomed in, closes the viewer.
    const onPhoto = (event.target as HTMLElement).tagName === "IMG";
    if (!onPhoto && current.current.scale <= 1.05) {
      window.setTimeout(() => {
        if (lastTap.current?.time === now) onClose();
      }, 300);
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const at = local(event.clientX, event.clientY);
    apply((v) => zoomAt(v, v.scale * Math.exp(-event.deltaY * 0.0015), at));
  };

  if (typeof document === "undefined") return null;
  const zoomed = view.scale > 1.05;
  const button = "grid size-11 place-items-center rounded-full bg-white/12 text-white backdrop-blur-md transition active:scale-90 disabled:opacity-35";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={l("Fotoğraf", "Photo")} className="fixed inset-0 z-[2147483000] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-3 pb-2 pt-[calc(0.5rem+var(--app-safe-top,0px))]">
        <span className="rounded-full bg-white/12 px-3 py-1.5 text-[12.5px] font-semibold tabular-nums text-white/85">{Math.round(view.scale * 100)}%</span>
        <button type="button" onClick={onClose} aria-label={l("Kapat", "Close")} className={button}>
          <X className="size-5" strokeWidth={2.4} />
        </button>
      </div>

      <div
        ref={stage}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain will-change-transform"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: moving ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
            cursor: zoomed ? "grab" : "zoom-in",
          }}
        />
      </div>

      <div className="flex items-center justify-center gap-3 px-3 pb-[calc(1rem+var(--app-safe-bottom,0px))] pt-3">
        <button type="button" onClick={() => apply((v) => zoomAt(v, v.scale / STEP, { x: 0, y: 0 }))} disabled={view.scale <= MIN_SCALE} aria-label={l("Küçült", "Zoom out")} className={button}>
          <Minus className="size-5" strokeWidth={2.4} />
        </button>
        <button type="button" onClick={() => apply(FIT)} disabled={!zoomed} aria-label={l("Ekrana sığdır", "Fit to screen")} className={button}>
          <Maximize2 className="size-[18px]" strokeWidth={2.4} />
        </button>
        <button type="button" onClick={() => apply((v) => zoomAt(v, v.scale * STEP, { x: 0, y: 0 }))} disabled={view.scale >= MAX_SCALE} aria-label={l("Büyüt", "Zoom in")} className={button}>
          <Plus className="size-5" strokeWidth={2.4} />
        </button>
      </div>
      <p className="sr-only">{l("İki parmakla ya da çift dokunarak yakınlaştır, sürükleyerek gez.", "Pinch or double-tap to zoom, drag to move around.")}</p>
    </div>,
    document.body
  );
}
