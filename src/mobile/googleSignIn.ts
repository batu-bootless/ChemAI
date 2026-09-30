// Chem+ app: Google refuses to show its sign-in page inside an app's web view, so the app uses
// Android's own Google account sheet (Credential Manager) and hands the ID token to Supabase.
//
// The sheet only works for a build registered in the Google console (its package and signing
// SHA-1) and on a phone with a Google account. Otherwise sign-in goes through ChemPlus's own Google
// sign-in on the web - Supabase's Google login, the one chemplus.com.tr uses - in the phone's
// browser, which comes back to the app at <package>://auth-callback with a code the app exchanges
// for the session (PKCE: the code is worthless without the verifier this app keeps). That address
// must be in Supabase's redirect list (README, "Android kimliği").
import { App } from "@capacitor/app";
import { createClient } from "@/lib/supabase/client";
import { textFor } from "./i18n";
import { ChemPlus, GOOGLE_WEB_CLIENT_ID, openExternal } from "./native";
import { adoptGoogleAvatar } from "./googleAvatar";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

export type GoogleSignInResult =
  | { ok: true }
  | { ok: false; error: string; canceled?: boolean };

/** The account sheet cannot be used here: this build is not registered, or the phone has no Google account. */
const SHEET_UNAVAILABLE = new Set(["NOT_CONFIGURED", "NO_ACCOUNT"]);

export async function signInWithGoogleNative(): Promise<GoogleSignInResult> {
  // Google puts the hashed nonce into the ID token; Supabase checks it against the raw one.
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));

  let idToken: string;
  try {
    ({ idToken } = await ChemPlus.googleSignIn({
      serverClientId: GOOGLE_WEB_CLIENT_ID,
      hashedNonce: await sha256Hex(nonce),
    }));
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "CANCELED") return { ok: false, error: "", canceled: true };
    if (code && SHEET_UNAVAILABLE.has(code)) return signInWithGoogleInBrowser();
    // The code goes with the message: it is the difference between "no Google account on this
    // phone" and "this build is not registered in the Google console", and the user can read it
    // out to us.
    const message = error instanceof Error ? error.message : "";
    const text = message || textFor("Google ile giriş yapılamadı.", "Couldn't sign in with Google.");
    console.error("Google sign-in failed", code, error);
    return { ok: false, error: code ? `${text} (${code})` : text };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce });
  if (error) {
    console.error("Supabase rejected the Google token", error);
    return { ok: false, error: `${textFor("Google ile giriş yapılamadı", "Couldn't sign in with Google")}: ${error.message}` };
  }
  return sessionStored();
}

/** The session is written asynchronously; the screen only leaves once it is really there. */
async function sessionStored(): Promise<GoogleSignInResult> {
  const supabase = createClient();
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      // The Google photo fills an empty profile picture; a failure here must not block sign-in.
      await adoptGoogleAvatar().catch((error) => console.error("Google avatar could not be adopted", error));
      return { ok: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return {
    ok: false,
    error: textFor(
      "Giriş tamamlandı ama oturum bu cihazda saklanamadı. Lütfen tekrar deneyin.",
      "Signed in, but the session could not be stored on this device. Please try again."
    ),
  };
}

// --- through ChemPlus's Google sign-in on the web ------------------------------------------------

const CALLBACK_HOST = "auth-callback";
/** A sign-in left open in the browser this long is given up. */
const BROWSER_WAIT_MS = 10 * 60_000;
/** Back in the app without the callback: this long for the link to still arrive, then cancelled. */
const RETURN_GRACE_MS = 2500;

async function callbackAddress(): Promise<string> {
  const { id } = await App.getInfo();
  return `${id}://${CALLBACK_HOST}`;
}

/** The callback link, or null when the user came back to the app without finishing (or gave up). */
async function waitForCallback(prefix: string): Promise<{ result: Promise<string | null>; stop: () => void }> {
  let finish: (value: string | null) => void = () => undefined;
  const result = new Promise<string | null>((resolve) => {
    finish = resolve;
  });
  let leftApp = false;
  let grace = 0;
  const onUrl = await App.addListener("appUrlOpen", ({ url }) => {
    if (url.startsWith(prefix)) finish(url);
  });
  const onState = await App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) {
      leftApp = true;
      window.clearTimeout(grace);
    } else if (leftApp) {
      grace = window.setTimeout(() => finish(null), RETURN_GRACE_MS);
    }
  });
  const timer = window.setTimeout(() => finish(null), BROWSER_WAIT_MS);
  const stop = () => {
    window.clearTimeout(timer);
    window.clearTimeout(grace);
    void onUrl.remove();
    void onState.remove();
  };
  return { result, stop };
}

/** The session from the code in the callback link (or the error Supabase sent instead). */
async function finishWithCallback(url: string): Promise<GoogleSignInResult> {
  const link = new URL(url);
  // Supabase puts an error in the query or, for some errors, after the #.
  const query = link.searchParams;
  const hash = new URLSearchParams(link.hash.slice(1));
  const code = query.get("code");
  if (!code) {
    const reason = query.get("error_description") || hash.get("error_description") || query.get("error") || hash.get("error");
    return { ok: false, error: reason ? `${textFor("Google ile giriş yapılamadı", "Couldn't sign in with Google")}: ${reason}` : textFor("Google ile giriş yapılamadı.", "Couldn't sign in with Google.") };
  }
  const { error } = await createClient().auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Supabase could not finish the Google sign-in", error);
    return { ok: false, error: `${textFor("Google ile giriş yapılamadı", "Couldn't sign in with Google")}: ${error.message}` };
  }
  return sessionStored();
}

/** Google through ChemPlus's web sign-in, in the phone's browser; back in the app with the session. */
export async function signInWithGoogleInBrowser(): Promise<GoogleSignInResult> {
  const redirectTo = await callbackAddress();
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data?.url) {
    console.error("Google sign-in in the browser could not start", error);
    return { ok: false, error: textFor("Google ile giriş başlatılamadı. Lütfen tekrar deneyin.", "Couldn't start Google sign-in. Please try again.") };
  }
  const callback = await waitForCallback(redirectTo);
  try {
    await openExternal(data.url);
    const url = await callback.result;
    if (!url) return { ok: false, error: "", canceled: true };
    return await finishWithCallback(url);
  } finally {
    callback.stop();
  }
}

let launchChecked = false;

/**
 * A sign-in whose callback started the app anew (Android closed it while the browser was open):
 * finished from the link the app was opened with - once, as the link stays for the app's life.
 * Null when the app was opened some other way.
 */
export async function finishGoogleSignInFromLaunch(): Promise<GoogleSignInResult | null> {
  if (launchChecked) return null;
  launchChecked = true;
  const launch = await App.getLaunchUrl().catch(() => undefined);
  const prefix = await callbackAddress();
  if (!launch?.url?.startsWith(prefix)) return null;
  return finishWithCallback(launch.url);
}
