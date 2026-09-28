"use client";

// ChemAI Android app shell: installs the native bridges before any page effect runs, hides the
// splash screen and handles the Android back button.
import { useEffect } from "react";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { closeTopSheet, installNativeBridges } from "./bridges";
import { isNativeApp } from "./native";
import { pinPhoneViewport } from "./tabletViewport";

installNativeBridges();
pinPhoneViewport();

const AUTH_PATHS = ["/login", "/register"];
const OPEN_MENUS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

function isVisible(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function handleBack(canGoBack: boolean) {
  if (closeTopSheet()) return;

  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (AUTH_PATHS.includes(path)) {
    void App.exitApp();
    return;
  }

  // Dialogs, menus and the mobile navigation sheet close on Escape, like on the website.
  if (Array.from(document.querySelectorAll(OPEN_MENUS)).some(isVisible)) {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    return;
  }

  // Iris (/dashboard) is the first screen: back there leaves the app.
  if (canGoBack && path !== "/dashboard") window.history.back();
  else void App.exitApp();
}

export default function AppShell() {
  useEffect(() => {
    if (!isNativeApp() || window.top !== window) return;
    void SplashScreen.hide();

    const listener = App.addListener("backButton", ({ canGoBack }) => handleBack(canGoBack));
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
