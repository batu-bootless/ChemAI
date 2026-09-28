import { createClient } from "@/lib/supabase/client";
import { signInWithGoogleNative } from "@/mobile/googleSignIn";
import { isNativeApp } from "@/mobile/native";
// Chem+ app: messages in the chosen language (src/mobile/i18n.ts).
import { textFor } from "@/mobile/i18n";

export interface NotificationPreferences {
  security: boolean;
  product: boolean;
  community: boolean;
}

export interface UserProfile {
  avatar: string; // public Storage URL, empty string = no custom avatar
  bio: string;
  location: string;
  birthDate: string;
  website: string;
  twitter: string;
  linkedin: string;
  github: string;
  /** "paper" is the app's own cream theme; the website falls back to light for it. */
  themePreference: "light" | "paper" | "dark" | "system";
  languagePreference: "tr" | "en";
  twoFactorEnabled: boolean;
  notifications: NotificationPreferences;
  updatedAt: string;
  passwordUpdatedAt: string | null;
  // Business-plan gating. Only ever set by the admin_set_business_access
  // RPC (see 20260809120000_business_access.sql) - never exposed through
  // updateProfile()'s patch mapping, since a normal user has no legitimate
  // way to change these themselves.
  accountType: "academy" | "business";
  subscriptionStatus: "active" | "inactive";
  // Academy plan tier. Same rule as above - only ever set by the Shopier
  // checkout webhook or the admin panel (see 20260813120000_billing_plans.sql).
  academyPlan: "free" | "pro" | "team";
  // When the current paid academy plan expires and reverts to free (set by
  // the same webhook; see 20260815120000_plan_expiry.sql's hourly cron job).
  academyPlanExpiresAt: string | null;
  // False only for a brand-new OAuth (Google/Apple) user who still has the
  // throwaway placeholder username the trigger assigned - the app forces them to
  // pick a real one (see UsernameOnboarding + set_username RPC). Email/password
  // users and everyone who has chosen are true.
  usernameChosen: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

interface ProfileRow {
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  birth_date: string | null;
  website: string | null;
  twitter: string | null;
  linkedin: string | null;
  github: string | null;
  theme_preference: string | null;
  language_preference: string | null;
  two_factor_enabled: boolean | null;
  notify_security: boolean | null;
  notify_product: boolean | null;
  notify_community: boolean | null;
  updated_at: string;
  password_updated_at: string | null;
  account_type: string | null;
  subscription_status: string | null;
  academy_plan: string | null;
  academy_plan_expires_at: string | null;
  username_chosen: boolean | null;
}

function defaultProfile(): UserProfile {
  return {
    avatar: "",
    bio: "",
    location: "",
    birthDate: "",
    website: "",
    twitter: "",
    linkedin: "",
    github: "",
    themePreference: "system",
    languagePreference: "tr",
    twoFactorEnabled: false,
    notifications: { security: true, product: true, community: false },
    updatedAt: new Date().toISOString(),
    passwordUpdatedAt: null,
    accountType: "academy",
    subscriptionStatus: "inactive",
    academyPlan: "free",
    academyPlanExpiresAt: null,
    // Default true so a failed/missing profile fetch never wrongly forces
    // onboarding; only a real row with username_chosen=false triggers it.
    usernameChosen: true,
  };
}

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    avatar: row.avatar_url ?? "",
    bio: row.bio ?? "",
    location: row.location ?? "",
    birthDate: row.birth_date ?? "",
    website: row.website ?? "",
    twitter: row.twitter ?? "",
    linkedin: row.linkedin ?? "",
    github: row.github ?? "",
    themePreference: (row.theme_preference as UserProfile["themePreference"]) ?? "system",
    languagePreference: (row.language_preference as UserProfile["languagePreference"]) ?? "tr",
    twoFactorEnabled: row.two_factor_enabled ?? false,
    notifications: {
      security: row.notify_security ?? true,
      product: row.notify_product ?? true,
      community: row.notify_community ?? false,
    },
    updatedAt: row.updated_at,
    passwordUpdatedAt: row.password_updated_at,
    accountType: row.account_type === "business" ? "business" : "academy",
    subscriptionStatus: row.subscription_status === "active" ? "active" : "inactive",
    academyPlan: row.academy_plan === "pro" || row.academy_plan === "team" ? row.academy_plan : "free",
    academyPlanExpiresAt: row.academy_plan_expires_at,
    usernameChosen: row.username_chosen ?? true,
  };
}

function usernameFromUser(user: { user_metadata?: { username?: string } | null; email?: string | null }): string {
  return user.user_metadata?.username || user.email?.split("@")[0] || "kullanici";
}

// Supabase's client treats 5xx responses as transient/retryable and never parses
// their JSON body, so `error.message` ends up being `JSON.stringify(rawResponse)`
// (i.e. the literal string "{}") instead of the actual server-side error text.
function authErrorMessage(error: { message: string; status?: number }, fallback: string): string {
  if (error.status && error.status >= 500) return fallback;
  return error.message || fallback;
}

export async function register(
  username: string,
  email: string,
  password: string
): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> {
  username = username.trim();
  email = email.trim().toLowerCase();
  if (!username || !email || !password) {
    return { ok: false, error: textFor("Lütfen tüm alanları doldurun.", "Please fill in all fields.") };
  }
  if (password.length < 6) {
    return { ok: false, error: textFor("Şifre en az 6 karakter olmalı.", "Password must be at least 6 characters.") };
  }

  const supabase = createClient();
  const { data: available } = await supabase.rpc("username_available", { p_username: username });
  if (available === false) {
    return { ok: false, error: textFor("Bu kullanıcı adı zaten alınmış.", "This username is already taken.") };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) {
    if (/registered|exists/i.test(error.message)) {
      return { ok: false, error: textFor("Bu e-posta adresi zaten kayıtlı.", "This email is already registered.") };
    }
    return { ok: false, error: authErrorMessage(error, textFor("Kayıt tamamlanamadı. Lütfen biraz sonra tekrar deneyin.", "Registration could not be completed. Please try again shortly.")) };
  }
  if (!data.user) {
    return { ok: false, error: textFor("Hesap oluşturulamadı. Lütfen tekrar deneyin.", "Account could not be created. Please try again.") };
  }

  return {
    ok: true,
    user: {
      id: data.user.id,
      username,
      email: data.user.email ?? email,
      createdAt: data.user.created_at,
    },
  };
}

/**
 * Chem+ app: sign-up with just an email and a password. Without a username in the metadata the
 * sign-up trigger stores a placeholder with username_chosen = false, so UsernameOnboarding asks
 * the user to pick one right after.
 */
export async function registerWithEmail(
  email: string,
  password: string
): Promise<{ ok: true; needsConfirmation: boolean } | { ok: false; error: string }> {
  email = email.trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, error: textFor("Lütfen tüm alanları doldurun.", "Please fill in all fields.") };
  }
  if (password.length < 6) {
    return { ok: false, error: textFor("Şifre en az 6 karakter olmalı.", "Password must be at least 6 characters.") };
  }

  const { data, error } = await createClient().auth.signUp({ email, password });
  if (error) {
    if (/registered|exists/i.test(error.message)) {
      return { ok: false, error: textFor("Bu e-posta adresi zaten kayıtlı.", "This email is already registered.") };
    }
    return { ok: false, error: authErrorMessage(error, textFor("Kayıt tamamlanamadı. Lütfen biraz sonra tekrar deneyin.", "Registration could not be completed. Please try again shortly.")) };
  }
  if (!data.user) {
    return { ok: false, error: textFor("Hesap oluşturulamadı. Lütfen tekrar deneyin.", "Account could not be created. Please try again.") };
  }
  // With email confirmation switched on there is no session yet: the user has to open the link.
  return { ok: true, needsConfirmation: !data.session };
}

export async function login(
  identity: string,
  password: string
): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> {
  identity = identity.trim();
  const supabase = createClient();

  let email = identity;
  if (!identity.includes("@")) {
    const { data: resolvedEmail } = await supabase.rpc("email_for_username", { p_username: identity });
    if (!resolvedEmail) {
      return { ok: false, error: textFor("Kullanıcı adı/e-posta veya şifre hatalı.", "Invalid username/email or password.") };
    }
    email = resolvedEmail;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: textFor("Kullanıcı adı/e-posta veya şifre hatalı.", "Invalid username/email or password.") };
  }

  return {
    ok: true,
    user: {
      id: data.user.id,
      username: usernameFromUser(data.user),
      email: data.user.email ?? email,
      createdAt: data.user.created_at,
    },
  };
}

export type OAuthProvider = "google" | "apple";

/**
 * Chem+ app: signs in with a provider and returns { ok: true } once the session
 * exists. The website's redirect flow cannot run here (the app has no
 * /auth/callback, and Google blocks its page in web views), so Google sign-in
 * uses Android's account sheet. In a browser preview of the app it is unavailable.
 */
export async function signInWithProvider(
  provider: OAuthProvider,
  // Kept for the website's call signature; the native flow returns to the caller.
  _next?: string | null
): Promise<{ ok: false; error: string; canceled?: boolean } | { ok: true }> {
  if (!isNativeApp()) {
    return {
      ok: false,
      error: textFor("Google ile giriş yalnızca telefon uygulamasında çalışır. Burada e-posta ve şifrenizle giriş yapın.", "Google sign-in only works in the phone app. Sign in with your email and password here."),
    };
  }
  if (provider === "google") return signInWithGoogleNative();
  return { ok: false, error: textFor("Bu giriş yöntemi uygulamada henüz kullanılamıyor.", "This sign-in method isn't available in the app yet.") };
}

export async function logout(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

// Claims a real username for the signed-in user. Used by the one-time onboarding
// step OAuth (Google/Apple) users see, since they arrive with a placeholder.
// Writes to BOTH stores: profiles.username (uniqueness + login-by-username, via
// the set_username RPC which also flips username_chosen) AND the auth-user
// metadata (drives the display name in SessionUser and refreshes the session).
export async function chooseUsername(
  rawUsername: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const username = rawUsername.trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return {
      ok: false,
      error: textFor("Kullanıcı adı 3-20 karakter olmalı; yalnızca harf, rakam ve alt çizgi ( _ ) içerebilir.", "Usernames are 3-20 characters: letters, numbers and underscores ( _ ) only."),
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: textFor("Oturum bulunamadı. Lütfen tekrar giriş yapın.", "Your session has ended. Please sign in again.") };

  const { data: available } = await supabase.rpc("username_available", {
    p_username: username,
    p_exclude_id: user.id,
  });
  if (available === false) {
    return { ok: false, error: textFor("Bu kullanıcı adı zaten alınmış.", "This username is already taken.") };
  }

  const { error: rpcError } = await supabase.rpc("set_username", { p_username: username });
  if (rpcError) {
    if (/username_taken|duplicate|unique/i.test(rpcError.message)) {
      return { ok: false, error: textFor("Bu kullanıcı adı zaten alınmış.", "This username is already taken.") };
    }
    if (/invalid_username/i.test(rpcError.message)) {
      return {
        ok: false,
        error: textFor("Kullanıcı adı 3-20 karakter olmalı; yalnızca harf, rakam ve alt çizgi ( _ ) içerebilir.", "Usernames are 3-20 characters: letters, numbers and underscores ( _ ) only."),
      };
    }
    return { ok: false, error: textFor("Kullanıcı adı kaydedilemedi. Lütfen tekrar deneyin.", "The username couldn't be saved. Please try again.") };
  }

  // Reflect the chosen name in the session metadata so it shows up immediately
  // (SessionUser.username reads user_metadata). Non-fatal if it lags — profiles
  // is already the source of truth for uniqueness/login.
  await supabase.auth.updateUser({ data: { username } });

  return { ok: true };
}

export async function getProfile(userId: string): Promise<UserProfile> {
  const supabase = createClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return defaultProfile();
  return rowToProfile(data as ProfileRow);
}

export async function updateProfile(userId: string, patch: Partial<UserProfile>): Promise<void> {
  const supabase = createClient();
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.avatar !== undefined) dbPatch.avatar_url = patch.avatar;
  if (patch.bio !== undefined) dbPatch.bio = patch.bio;
  if (patch.location !== undefined) dbPatch.location = patch.location;
  if (patch.birthDate !== undefined) dbPatch.birth_date = patch.birthDate || null;
  if (patch.website !== undefined) dbPatch.website = patch.website;
  if (patch.twitter !== undefined) dbPatch.twitter = patch.twitter;
  if (patch.linkedin !== undefined) dbPatch.linkedin = patch.linkedin;
  if (patch.github !== undefined) dbPatch.github = patch.github;
  if (patch.themePreference !== undefined) dbPatch.theme_preference = patch.themePreference;
  if (patch.languagePreference !== undefined) dbPatch.language_preference = patch.languagePreference;
  if (patch.twoFactorEnabled !== undefined) dbPatch.two_factor_enabled = patch.twoFactorEnabled;
  if (patch.notifications !== undefined) {
    dbPatch.notify_security = patch.notifications.security;
    dbPatch.notify_product = patch.notifications.product;
    dbPatch.notify_community = patch.notifications.community;
  }
  const { error } = await supabase.from("profiles").update(dbPatch).eq("id", userId);
  if (error) throw error;
}

export async function updateAccount(
  userId: string,
  currentUsername: string,
  patch: { username?: string; email?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const username = patch.username?.trim();
  const email = patch.email?.trim().toLowerCase();

  if (username && username.toLowerCase() !== currentUsername.toLowerCase()) {
    const { data: available } = await supabase.rpc("username_available", {
      p_username: username,
      p_exclude_id: userId,
    });
    if (available === false) {
      return { ok: false, error: textFor("Bu kullanıcı adı zaten alınmış.", "This username is already taken.") };
    }
    const { error } = await supabase.from("profiles").update({ username }).eq("id", userId);
    if (error) return { ok: false, error: textFor("Kullanıcı adı güncellenemedi.", "Username could not be updated.") };
  }

  if (email) {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) return { ok: false, error: textFor("E-posta güncellenemedi: ", "Email could not be updated: ") + authErrorMessage(error, textFor("sunucu hatası, lütfen biraz sonra tekrar deneyin.", "server error, please try again shortly.")) };
  }

  return { ok: true };
}

export async function changePassword(
  userId: string,
  currentEmail: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 6) {
    return { ok: false, error: textFor("Yeni şifre en az 6 karakter olmalı.", "New password must be at least 6 characters.") };
  }
  const supabase = createClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: currentEmail,
    password: currentPassword,
  });
  if (reauthError) {
    return { ok: false, error: textFor("Mevcut şifre hatalı.", "Current password is incorrect.") };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: authErrorMessage(error, textFor("Şifre değiştirilemedi. Lütfen biraz sonra tekrar deneyin.", "Password could not be changed. Please try again shortly.")) };
  await supabase
    .from("profiles")
    .update({ password_updated_at: new Date().toISOString() })
    .eq("id", userId);
  return { ok: true };
}

export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined,
  });
  if (error) return { ok: false, error: authErrorMessage(error, textFor("Sıfırlama e-postası gönderilemedi. Lütfen biraz sonra tekrar deneyin.", "Reset email could not be sent. Please try again shortly.")) };
  return { ok: true };
}

export async function setNewPassword(newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 6) {
    return { ok: false, error: textFor("Yeni şifre en az 6 karakter olmalı.", "New password must be at least 6 characters.") };
  }
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: authErrorMessage(error, textFor("Şifre güncellenemedi. Lütfen biraz sonra tekrar deneyin.", "Password could not be updated. Please try again shortly.")) };
  return { ok: true };
}

export async function deleteAccount(): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/account/delete", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.error ?? textFor("Hesap silinemedi.", "The account could not be deleted.") };
  }
  const supabase = createClient();
  await supabase.auth.signOut();
  return { ok: true };
}

export function exportUserData(user: SessionUser, profile: UserProfile): void {
  const data = {
    account: {
      username: user.username,
      email: user.email,
      date_joined: user.createdAt,
      password_last_updated: profile.passwordUpdatedAt,
    },
    profile: {
      bio: profile.bio,
      location: profile.location,
      birth_date: profile.birthDate,
      website: profile.website,
      social: {
        twitter: profile.twitter,
        linkedin: profile.linkedin,
        github: profile.github,
      },
    },
    preferences: {
      theme: profile.themePreference,
      language: profile.languagePreference,
      two_factor_enabled: profile.twoFactorEnabled,
      notifications: profile.notifications,
    },
    exported_at: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 4)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `user_data_${user.username}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
