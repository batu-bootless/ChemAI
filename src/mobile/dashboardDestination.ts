/**
 * Chem+ app: where to go after signing in. Only dashboard pages exist in the app, so any other
 * `next` (a website page such as /business or /checkout) falls back to the dashboard home.
 */
export function dashboardDestination(next: string | null | undefined): string {
  if (!next?.startsWith("/") || next.startsWith("//")) return "/dashboard/";
  try {
    const url = new URL(next, "https://app.invalid");
    if (url.origin !== "https://app.invalid") return "/dashboard/";
    if (url.pathname !== "/dashboard" && !url.pathname.startsWith("/dashboard/")) return "/dashboard/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard/";
  }
}
