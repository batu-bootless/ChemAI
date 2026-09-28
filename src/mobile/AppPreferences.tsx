"use client";

// Chem+ app: applies the theme and language (src/mobile/preferences.ts) to the whole app.
//  - Theme: Tailwind's `dark` class, data-app-theme and color-scheme on <html>, the status bar icons.
//  - Language: <html lang>, and the page tree is mounted again when it changes, so every screen
//    reads its texts anew (many load site texts once, in an effect).
import { Fragment, useEffect, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { useAuth } from "@/lib/AuthContext";
import { isNativeApp } from "./native";
import { adoptProfileTheme, isDarkTheme, isPaperTheme, markHydrated, usePreferences } from "./preferences";

const THEME_COLORS = { light: "#f9fafb", paper: "#FFFCEC", dark: "#000000" } as const;

const noSubscribe = () => () => {};

/** False while React hydrates the static page (the boot script has already applied the theme). */
function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

function applyTheme(dark: boolean, paper: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("paper", paper);
  root.dataset.appTheme = dark ? "dark" : paper ? "paper" : "light";
  root.style.colorScheme = dark ? "dark" : "light";

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = dark ? THEME_COLORS.dark : paper ? THEME_COLORS.paper : THEME_COLORS.light;

  if (isNativeApp()) {
    void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }
}

export default function AppPreferences({ children }: { children: ReactNode }) {
  const preferences = usePreferences();
  const hydrated = useHydrated();
  const { profile } = useAuth();
  const dark = isDarkTheme(preferences);
  const paper = isPaperTheme(preferences);
  const profileTheme = profile?.themePreference;

  useLayoutEffect(() => {
    markHydrated();
  }, []);

  useLayoutEffect(() => {
    if (hydrated) applyTheme(dark, paper);
  }, [hydrated, dark, paper]);

  useLayoutEffect(() => {
    if (hydrated) document.documentElement.lang = preferences.language;
  }, [hydrated, preferences.language]);

  useEffect(() => {
    if (profileTheme) adoptProfileTheme(profileTheme);
  }, [profileTheme]);

  return <Fragment key={preferences.language}>{children}</Fragment>;
}
