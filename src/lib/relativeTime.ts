import { localeOf, textFor } from "@/mobile/i18n";
import { getLanguage } from "@/mobile/preferences";

// Chem+ app: in the chosen language (the website's version is Turkish only).
export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return textFor("az önce", "just now");
  if (diffMin < 60) return textFor(`${diffMin} dk önce`, `${diffMin} min ago`);
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return textFor(`${diffHour} sa önce`, `${diffHour} h ago`);
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return textFor(`${diffDay} gün önce`, `${diffDay} ${diffDay === 1 ? "day" : "days"} ago`);
  return new Date(timestamp).toLocaleDateString(localeOf(getLanguage()));
}
