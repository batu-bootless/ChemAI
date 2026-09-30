/**
 * Rollout flag for "Continue with Google".
 *
 * Google's account sheet (Credential Manager) only appears for a build whose package name and
 * signing SHA-1 are registered as an Android OAuth client in the Google Cloud project; for any
 * other build the sheet fails with a "developer console" error. ChemAI's own builds are registered
 * (README, "Android kimliği"), so the button is on unless a build that is not registered hides it
 * with NEXT_PUBLIC_FEATURE_GOOGLE_SIGNIN=false (email sign-in stays).
 */
export function isGoogleSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_GOOGLE_SIGNIN !== "false";
}
