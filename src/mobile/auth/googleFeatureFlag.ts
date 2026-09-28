/**
 * Rollout flag for "Continue with Google".
 *
 * Google's account sheet (Credential Manager) only appears once an Android OAuth client with this
 * app's package name and signing SHA-1 exists in the Google Cloud project. Until it does, the
 * sheet closes immediately and the button can only fail - a broken control that a Play reviewer
 * would try first. Set NEXT_PUBLIC_FEATURE_GOOGLE_SIGNIN=true in .env.local once the client is
 * registered; unset or anything else hides the button and leaves email sign-in, which works.
 */
export function isGoogleSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_GOOGLE_SIGNIN === "true";
}
