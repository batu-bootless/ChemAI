// Chem+ app: the Google account's photo becomes the profile photo on first sign-in.
//
// Google puts the picture in the ID token, so Supabase already has it in user_metadata by the time
// the session exists. It is copied into the avatars bucket - the same place a photo picked in
// Account settings goes - so the profile keeps working if Google rotates the link, and changing or
// removing the photo later behaves exactly as it does for an uploaded one.
//
// It only ever fills an empty profile photo, and only once per account on this device: a user who
// removes the photo afterwards does not get it back on the next sign-in.
import { createClient } from "@/lib/supabase/client";

const ADOPTED_KEY = "chemplus:google-avatar";

function adoptedAccounts(): string[] {
  try {
    const raw = window.localStorage.getItem(ADOPTED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function remember(userId: string): void {
  try {
    const accounts = adoptedAccounts();
    if (!accounts.includes(userId)) {
      window.localStorage.setItem(ADOPTED_KEY, JSON.stringify([...accounts, userId].slice(-20)));
    }
  } catch {
    // Private mode or storage disabled: the worst case is one repeated copy on the next sign-in.
  }
}

/** Google hands out a 96px thumbnail by default; ask for one that survives a retina header. */
function fullSize(url: string): string {
  return url.replace(/=s\d+(-c)?$/, "=s512-c");
}

/** Returns true when a photo was adopted, so the caller can refresh what is on screen. */
export async function adoptGoogleAvatar(): Promise<boolean> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return false;

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const photo =
    typeof metadata.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata.picture === "string"
        ? metadata.picture
        : "";
  if (!photo || adoptedAccounts().includes(user.id)) return false;

  // Read and write profiles directly: lib/auth imports the sign-in flow that calls this, and
  // going through it would close an import cycle.
  const { data: row } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  if (row?.avatar_url) {
    remember(user.id); // the user already has a photo - never touch it
    return false;
  }

  const source = fullSize(photo);
  let stored = source;
  try {
    const response = await fetch(source);
    if (response.ok) {
      const blob = await response.blob();
      const path = `${user.id}/avatar-google-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
      if (!error) stored = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }
  } catch {
    // Google's CDN can refuse a cross-origin read; the link itself still renders, so keep it.
  }

  await supabase
    .from("profiles")
    .update({ avatar_url: stored, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  remember(user.id);
  return true;
}
