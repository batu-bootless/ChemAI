// Chem+ app: storage keys of the theme and language preferences, and the inline script that applies
// them before the first paint (src/app/layout.tsx), so a dark-theme user never sees a white flash.
// Plain module (no "use client"): the root layout is a server component and needs the real string.

/**
 * The dark theme is locked: the app stays light whatever is stored or set on the phone, and
 * Account settings shows the dark and system cards with a lock. Set this to false to open it.
 */
export const DARK_THEME_LOCKED = true;

export const THEME_STORAGE_KEY = "chemplus:theme";
export const LANGUAGE_STORAGE_KEY = "chemplus:language";

export const PREFERENCES_BOOT_SCRIPT = `(function () {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var dark = ${DARK_THEME_LOCKED ? "false" : `theme === "dark" ||
      (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)`};
    var paper = !dark && theme === "paper";
    root.classList.toggle("dark", dark);
    root.classList.toggle("paper", paper);
    root.setAttribute("data-app-theme", dark ? "dark" : paper ? "paper" : "light");
    root.style.colorScheme = dark ? "dark" : "light";
    var language = localStorage.getItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)});
    if (language !== "tr" && language !== "en") {
      language = (navigator.language || "").toLowerCase().indexOf("tr") === 0 ? "tr" : "en";
    }
    root.lang = language;
  } catch (error) {}
})();`;
