// Chem+ app: Turkish / English texts. Components write both versions next to each other:
//   const l = useL();  <p>{l("Kaydet", "Save")}</p>
// Site texts from the website's CMS go through getSiteText (src/lib/siteContent.ts), which reads
// the Turkish versions from src/mobile/translations/siteTextTr.ts.
import { getLanguage, useLanguage, type Language } from "./preferences";

export type Translate = <T = string>(tr: T, en: T) => T;

const TRANSLATORS: Record<Language, Translate> = {
  tr: (tr) => tr,
  en: (_tr, en) => en,
};

/** The same function for a language every time, so it can sit in hook dependency lists. */
export function translator(language: Language): Translate {
  return TRANSLATORS[language];
}

export function useL(): Translate {
  return translator(useLanguage());
}

/** For code outside components (plain functions, values resolved at call time). */
export function textFor<T = string>(tr: T, en: T): T {
  return getLanguage() === "en" ? en : tr;
}

/** BCP 47 locale for dates and numbers. */
export function localeOf(language: Language): string {
  return language === "en" ? "en-US" : "tr-TR";
}

export function useLocale(): string {
  return localeOf(useLanguage());
}
