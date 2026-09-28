// Chem+ app: the user's theme (light / dark / system) and language (Turkish / English). They are
// device settings kept in localStorage; changes made in Account settings are also written to the
// profile. Static pages are rendered with SERVER_PREFERENCES, and the device's values take over
// right after hydration.
import { useSyncExternalStore } from "react";
import { DARK_THEME_LOCKED, LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY } from "./preferencesBoot";

export type ThemePreference = "light" | "paper" | "dark" | "system";
export type Language = "tr" | "en";

export interface Preferences {
  theme: ThemePreference;
  language: Language;
  /** The device is in dark mode (what "system" follows). */
  systemDark: boolean;
  /** A theme was stored on this device (otherwise the profile's may be adopted). */
  themeStored: boolean;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

const SERVER_PREFERENCES: Preferences = { theme: "system", language: "tr", systemDark: false, themeStored: false };

let current: Preferences | null = null;
const listeners = new Set<() => void>();

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage disabled: the choice lasts for this session.
  }
}

function isTheme(value: string | null): value is ThemePreference {
  return value === "light" || value === "paper" || value === "dark" || value === "system";
}

function isLanguage(value: string | null): value is Language {
  return value === "tr" || value === "en";
}

export function deviceLanguage(): Language {
  return (navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

function snapshot(): Preferences {
  if (!current) {
    const storedTheme = readStorage(THEME_STORAGE_KEY);
    const storedLanguage = readStorage(LANGUAGE_STORAGE_KEY);
    const media = window.matchMedia(DARK_QUERY);
    current = {
      theme: isTheme(storedTheme) ? storedTheme : "system",
      language: isLanguage(storedLanguage) ? storedLanguage : deviceLanguage(),
      systemDark: media.matches,
      themeStored: isTheme(storedTheme),
    };
    media.addEventListener("change", (event) => update({ systemDark: event.matches }));
  }
  return current;
}

function update(patch: Partial<Preferences>) {
  current = { ...snapshot(), ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_PREFERENCES);
}

export function useLanguage(): Language {
  return usePreferences().language;
}

export function isDarkTheme({ theme, systemDark }: Pick<Preferences, "theme" | "systemDark">): boolean {
  if (DARK_THEME_LOCKED) return false;
  return theme === "dark" || (theme === "system" && systemDark);
}

/** The cream paper theme (src/app/app-paper.css), a theme of its own next to light and dark. */
export function isPaperTheme({ theme }: Pick<Preferences, "theme">): boolean {
  return theme === "paper";
}

// Until the static page has hydrated, code outside React sees the language it was rendered with.
let hydrated = false;

export function markHydrated() {
  hydrated = true;
}

/** Current language outside React (e.g. site texts). */
export function getLanguage(): Language {
  return typeof window === "undefined" || !hydrated ? SERVER_PREFERENCES.language : snapshot().language;
}

export function setThemePreference(theme: ThemePreference) {
  writeStorage(THEME_STORAGE_KEY, theme);
  update({ theme, themeStored: true });
}

export function setLanguagePreference(language: Language) {
  writeStorage(LANGUAGE_STORAGE_KEY, language);
  update({ language });
}

/** Uses the theme saved in the profile (e.g. on the website) when this device has none yet. */
export function adoptProfileTheme(theme: ThemePreference) {
  if (!snapshot().themeStored) setThemePreference(theme);
}
