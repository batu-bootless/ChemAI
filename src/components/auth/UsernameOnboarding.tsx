"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, TriangleAlert, AtSign, Check, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { chooseUsername } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { useL } from "@/mobile/i18n";

type Availability = "idle" | "checking" | "free" | "taken";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

// One-time, non-dismissible step shown to a brand-new OAuth (Google/Apple) user
// who still carries the placeholder username the sign-up trigger assigned. They
// must pick their own handle before using the app. Email/password users (and
// anyone who has already chosen) have usernameChosen=true and never see this.
export default function UsernameOnboarding() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const l = useL();
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");

  const needsUsername = !loading && !!profile && profile.usernameChosen === false;
  const value = username.trim();
  const formatOk = USERNAME_RE.test(value);

  // Debounced live "is this taken?" check, mirroring the register form.
  useEffect(() => {
    if (!needsUsername || !formatOk) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    const supabase = createClient();
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("username_available", {
        p_username: value,
        p_exclude_id: user?.id ?? null,
      });
      setAvailability(data === false ? "taken" : "free");
    }, 400);
    return () => clearTimeout(t);
  }, [value, formatOk, needsUsername, user?.id]);

  if (!needsUsername) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await chooseUsername(username);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    // updateUser fires USER_UPDATED -> AuthContext reloads the profile and this
    // modal unmounts once usernameChosen flips to true. refreshProfile() nudges
    // it along; keep `submitting` true so the button can't be pressed twice.
    refreshProfile();
  }

  const canSubmit = formatOk && availability !== "taken" && availability !== "checking" && !submitting;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-5">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <AtSign className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">{l("Kullanıcı adını seç", "Choose a username")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {l(
              "ChemAI'a hoş geldin! Hesabını tamamlamak için bir kullanıcı adı belirle. Bu ad profilinde ve giriş yaparken kullanılacak.",
              "Welcome to ChemAI! Pick a username to finish your account. It appears on your profile and you can sign in with it."
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="onboarding-username" className="mb-1.5 block text-sm font-medium text-gray-700">
              {l("Kullanıcı adı", "Username")}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">@</span>
              <input
                id="onboarding-username"
                type="text"
                autoFocus
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={l("kullanici_adi", "your_username")}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-8 pr-11 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {availability === "checking" && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                {availability === "free" && <Check className="h-4 w-4 text-emerald-500" />}
                {availability === "taken" && <X className="h-4 w-4 text-red-500" />}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {l("3-20 karakter; harf, rakam ve alt çizgi ( _ ).", "3-20 characters; letters, numbers and underscore ( _ ).")}
            </p>
            {availability === "taken" && (
              <p className="mt-1 text-xs font-medium text-red-500">{l("Bu kullanıcı adı zaten alınmış.", "This username is already taken.")}</p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-blue-500/25 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {l("Kaydediliyor...", "Saving...")}
              </>
            ) : (
              <>
                {l("Devam et", "Continue")}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
