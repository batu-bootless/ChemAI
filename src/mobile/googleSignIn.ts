// Chem+ app: Google refuses to show its sign-in page inside an app's web view, so the app uses
// Android's own Google account sheet (Credential Manager) and hands the ID token to Supabase.
import { createClient } from "@/lib/supabase/client";
import { textFor } from "./i18n";
import { ChemPlus, GOOGLE_WEB_CLIENT_ID } from "./native";
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

  // The session is written asynchronously; the screen only leaves once it is really there.
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
