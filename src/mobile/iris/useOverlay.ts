"use client";

// ChemAI: overlays (the menu, sheets, viewers) close one at a time, newest first - on Escape and
// on the Android back button (AppShell turns it into Escape while a dialog is open).

import { useEffect, useRef } from "react";

interface Entry {
  close: () => void;
}

const stack: Entry[] = [];
let installed = false;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || stack.length === 0) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      stack[stack.length - 1].close();
    },
    true
  );
}

/** While `open`, the newest overlay gets the next Escape / back press. */
export function useOverlay(open: boolean, onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!open) return;
    install();
    const entry: Entry = { close: () => latest.current() };
    stack.push(entry);
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
    };
  }, [open]);
}
