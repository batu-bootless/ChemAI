"use client";

// ChemAI: the frame around Iris's pages - the ☰ menu, the settings sheet, and a way for the page on
// screen to take the menu's "new chat" / "open this chat" itself (the chat page does, so the
// conversation on screen changes without a page load).
//
// The menu opens as ChatGPT's does: the page slides right and becomes a white panel with rounded
// corners over the menu, which lies underneath; tapping the panel (or sliding it back) closes it.
// On the pages that have the ☰ button, sliding the screen sideways opens and closes the menu,
// the panel following the finger.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useL } from "@/mobile/i18n";
import Drawer from "./Drawer";
import SettingsSheet, { type SettingsPage } from "./SettingsSheet";
import { IRIS } from "./theme";

export interface PageHandlers {
  newChat?: () => void;
  openConversation?: (id: string) => void;
  /** The conversation on screen, for the menu's highlight. */
  activeConversation?: string | null;
}

interface ShellApi {
  openDrawer: () => void;
  closeDrawer: () => void;
  openSettings: (page?: SettingsPage) => void;
  register: (handlers: PageHandlers) => () => void;
  handlers: () => PageHandlers;
  /** The page on screen has the ☰ button: sliding the screen sideways opens the menu. */
  allowSwipe: () => () => void;
}

const ShellContext = createContext<ShellApi | null>(null);

export function useIrisShell(): ShellApi {
  const api = useContext(ShellContext);
  if (!api) throw new Error("useIrisShell outside IrisShell");
  return api;
}

/** The page on screen tells the menu how to start a chat or open one here. */
export function usePageHandlers(handlers: PageHandlers) {
  const { register } = useIrisShell();
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(
    () =>
      register({
        newChat: () => latest.current.newChat?.(),
        openConversation: (id) => latest.current.openConversation?.(id),
        get activeConversation() {
          return latest.current.activeConversation ?? null;
        },
      }),
    [register]
  );
}

/** A page with the ☰ button: the menu also opens by sliding the screen to the right. */
export function useMenuSwipe() {
  const { allowSwipe } = useIrisShell();
  useEffect(() => allowSwipe(), [allowSwipe]);
}

/** How much of the page stays in sight, as a panel, while the menu is open. */
const PANEL_PEEK = 62;
const MAX_MENU_WIDTH = 360;
/** Past this speed (px/ms) a slide opens or closes the menu whatever its distance. */
const FLICK = 0.35;
const SPRING = { type: "spring" as const, stiffness: 420, damping: 44, restDelta: 0.001 };

/** Something already takes the screen (voice mode, a sheet, a dialog, a menu): no sliding. */
function overlayOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'));
}

/** The touch began on something that moves sideways itself (a scrolling row, a 3D model, a slider). */
function ownsSideways(target: EventTarget | null): boolean {
  for (let node = target instanceof Element ? target : null; node && node !== document.body; node = node.parentElement) {
    if (node instanceof HTMLInputElement && node.type === "range") return true;
    const style = window.getComputedStyle(node);
    if (style.touchAction === "none" || style.touchAction.includes("pan-y")) return true;
    if ((style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 2) return true;
  }
  return false;
}

export default function IrisShell({ children }: { children: ReactNode }) {
  const l = useL();
  const [menu, setMenu] = useState<{ mounted: boolean; open: boolean; width: number }>({ mounted: false, open: false, width: 320 });
  const [settings, setSettings] = useState<{ open: boolean; page?: SettingsPage }>({ open: false });
  const handlersRef = useRef<PageHandlers>({});
  const swipeRoots = useRef(0);
  const progress = useMotionValue(0);
  const running = useRef<AnimationPlaybackControls | null>(null);
  const state = useRef(menu);
  state.current = menu;
  // The page's scroll while it is a panel (the panel does not scroll; it is given back after).
  const frozenAt = useRef(0);
  const restoreScroll = useRef<number | null>(null);
  const draggedAt = useRef(0);

  const frame = useRef<HTMLDivElement>(null);
  const menuX = useTransform(progress, (p) => (p - 1) * state.current.width * 0.2);
  const menuOpacity = useTransform(progress, [0, 1], [0.35, 1]);

  const mount = useCallback(() => {
    if (state.current.mounted) return state.current.width;
    const width = Math.min(window.innerWidth - PANEL_PEEK, MAX_MENU_WIDTH);
    frozenAt.current = window.scrollY;
    // The keyboard goes: the menu is not typed into.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    state.current = { mounted: true, open: false, width };
    setMenu(state.current);
    return width;
  }, []);

  const settle = useCallback(
    (open: boolean) => {
      running.current?.stop();
      setMenu((prev) => ({ ...prev, open }));
      running.current = animate(progress, open ? 1 : 0, {
        ...SPRING,
        onComplete: () => {
          if (open) return;
          restoreScroll.current = frozenAt.current;
          setMenu((prev) => ({ ...prev, mounted: false, open: false }));
        },
      });
    },
    [progress]
  );

  const openDrawer = useCallback(() => {
    mount();
    settle(true);
  }, [mount, settle]);
  const closeDrawer = useCallback(() => settle(false), [settle]);

  // The panel follows the menu's progress. Its transform is set here, not by React or motion, so
  // that none is left on the page afterwards: a transform would make every fixed element in the page
  // (bars, sheets) sit in the page instead of on the screen.
  useEffect(
    () =>
      progress.on("change", (p) => {
        const node = frame.current;
        if (!node || !state.current.mounted) return;
        node.style.transform = `translate3d(${p * state.current.width}px,0,0)`;
        node.style.borderRadius = `${Math.min(1, p / 0.08) * 30}px`;
      }),
    [progress]
  );

  // The page scrolls again where it was once it is a page again.
  useLayoutEffect(() => {
    const node = frame.current;
    if (menu.mounted) return;
    if (node) {
      node.style.transform = "";
      node.style.borderRadius = "";
    }
    if (restoreScroll.current === null) return;
    window.scrollTo(0, restoreScroll.current);
    restoreScroll.current = null;
  }, [menu.mounted]);

  // Sliding the screen: right opens the menu (on pages with ☰), left closes it; the panel follows
  // the finger and settles by distance, or by speed when flicked.
  useEffect(() => {
    let gesture: { x: number; y: number; base: number; horizontal: boolean | null; samples: { x: number; t: number }[] } | null = null;

    const onStart = (event: TouchEvent) => {
      gesture = null;
      if (event.touches.length !== 1) return;
      const open = state.current.mounted;
      if (!open && (swipeRoots.current === 0 || overlayOpen() || ownsSideways(event.target))) return;
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, base: progress.get(), horizontal: null, samples: [{ x: touch.clientX, t: event.timeStamp }] };
    };

    const onMove = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (gesture.horizontal === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        const sideways = Math.abs(dx) > Math.abs(dy) * 1.2 && (state.current.mounted || dx > 0);
        if (!sideways) {
          gesture = null;
          return;
        }
        gesture.horizontal = true;
        running.current?.stop();
        mount();
        gesture.base = progress.get();
        gesture.x = touch.clientX;
      }
      event.preventDefault();
      const width = state.current.width;
      progress.set(Math.min(1, Math.max(0, gesture.base + (touch.clientX - gesture.x) / width)));
      gesture.samples.push({ x: touch.clientX, t: event.timeStamp });
      if (gesture.samples.length > 6) gesture.samples.shift();
    };

    const onEnd = () => {
      const done = gesture;
      gesture = null;
      if (!done?.horizontal) return;
      draggedAt.current = performance.now();
      const first = done.samples[0];
      const last = done.samples[done.samples.length - 1];
      const velocity = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      settle(velocity > FLICK ? true : velocity < -FLICK ? false : progress.get() > 0.5);
    };

    // A slide that ends over a button must not press it.
    const onClick = (event: MouseEvent) => {
      if (performance.now() - draggedAt.current < 350) {
        event.stopPropagation();
        event.preventDefault();
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("click", onClick, true);
    };
  }, [mount, progress, settle]);

  const register = useCallback((handlers: PageHandlers) => {
    handlersRef.current = handlers;
    return () => {
      if (handlersRef.current === handlers) handlersRef.current = {};
    };
  }, []);

  const allowSwipe = useCallback(() => {
    swipeRoots.current += 1;
    return () => {
      swipeRoots.current = Math.max(0, swipeRoots.current - 1);
    };
  }, []);

  const api = useMemo<ShellApi>(
    () => ({
      openDrawer,
      closeDrawer,
      openSettings: (page) => setSettings({ open: true, page }),
      register,
      handlers: () => handlersRef.current,
      allowSwipe,
    }),
    [openDrawer, closeDrawer, register, allowSwipe]
  );

  return (
    <ShellContext.Provider value={api}>
      {menu.mounted && (
        <motion.div className="fixed inset-y-0 left-0 z-[1]" style={{ width: menu.width, x: menuX, opacity: menuOpacity }}>
          <Drawer open={menu.open} onClose={closeDrawer} />
        </motion.div>
      )}
      {/* The page. While the menu is out it is a panel: fixed, rounded, outlined, and a tap on it closes the menu. */}
      <div
        ref={frame}
        style={
          menu.mounted
            ? {
                position: "fixed",
                inset: 0,
                zIndex: 2,
                overflow: "hidden",
                background: IRIS.bg,
                boxShadow: "0 0 0 1px rgb(0 0 0 / 0.07), -12px 0 36px -8px rgb(0 0 0 / 0.12)",
                willChange: "transform",
              }
            : undefined
        }
      >
        <div style={menu.mounted ? { transform: `translateY(${-frozenAt.current}px)` } : undefined}>{children}</div>
        {menu.mounted && (
          <button
            type="button"
            aria-label={l("Menüyü kapat", "Close the menu")}
            tabIndex={-1}
            onClick={closeDrawer}
            className="absolute inset-0 z-[1000] cursor-default bg-transparent"
          />
        )}
      </div>
      <AnimatePresence>
        {settings.open && <SettingsSheet key="settings" initialPage={settings.page} onClose={() => setSettings({ open: false })} />}
      </AnimatePresence>
    </ShellContext.Provider>
  );
}
