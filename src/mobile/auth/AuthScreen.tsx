"use client";

// ChemAI sign-in screen (Iris needs an account, so the app opens here when signed out). Two views: choosing how to continue, and the email form with the
// Log in / Sign up switcher. Google takes the place of Apple; the rest follows the design given.
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Beaker, Eye, EyeOff, Loader2, Mail, Mic, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { registerWithEmail, signInWithProvider } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { useL } from "@/mobile/i18n";
import Wordmark from "@/mobile/brand/Wordmark";
import { isGoogleSignInEnabled } from "./googleFeatureFlag";
import { openExternal, WEBSITE_ORIGIN } from "@/mobile/native";

function GoogleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** The app's name in the middle of the badges, in the wordmark's type (no logo). */
function Illustration() {
  return (
    <div className="w-60 h-24 flex items-center justify-center">
      <h2>
        <Wordmark height={48} />
      </h2>
    </div>
  );
}

function Badges() {
  const l = useL();
  const badge = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-900 bg-white text-xs font-medium shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]";
  return (
    <>
      <span className={`absolute top-2 left-2 ${badge}`}>
        <Beaker className="w-3.5 h-3.5" /> {l("Lab", "Lab")}
      </span>
      <span className={`absolute top-0 right-2 ${badge}`}>
        <Sparkles className="w-3.5 h-3.5" /> {l("İris", "Iris")}
      </span>
      <span className={`absolute bottom-2 right-0 ${badge}`}>
        <Mic className="w-3.5 h-3.5" /> {l("Sesli", "Voice")}
      </span>
    </>
  );
}

function LegalNote() {
  const l = useL();
  return (
    <p className="text-[11px] text-center text-slate-500 mt-6 leading-relaxed">
      {l("Devam ederek ", "By continuing, you agree to our ")}
      <Link href="/gizlilik/" className="underline font-semibold text-slate-700">
        {l("Gizlilik Politikası", "Privacy Policy")}
      </Link>
      {l("'nı kabul etmiş olursunuz.", ".")}
    </p>
  );
}

export default function AuthScreen({ tab, next }: { tab: "login" | "register"; next?: string | null }) {
  const router = useRouter();
  const l = useL();
  const { login, refreshProfile } = useAuth();

  const [view, setView] = useState<"choose" | "email">(tab === "register" ? "email" : "choose");
  const [isSignUp, setIsSignUp] = useState(tab === "register");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fallback = useRef(0);

  const destination = next && next.startsWith("/") ? next : "/dashboard/";

  // Leaving the screen after a sign-in. The session is written by the sign-in call itself, but
  // the Google flow comes back from Android's account sheet, where a reload can outrun that write
  // - so wait for the session first, then navigate inside the app and fall back to a full one.
  const done = async () => {
    const supabase = createClient();
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    router.replace(destination);
    fallback.current = window.setTimeout(() => {
      if (window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/register")) {
        window.location.replace(destination);
      }
    }, 600);
  };

  // ChemAI: every screen needs an account, so there is nothing to go back to from here - only
  // from the email form to the choice.
  const goBack = () => {
    setView("choose");
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = isSignUp ? await registerWithEmail(email, password) : await login(email, password);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    if ("needsConfirmation" in result && result.needsConfirmation) {
      setNotice(l("Hesabını doğrulamak için e-postana gönderdiğimiz bağlantıya tıkla.", "Tap the link we emailed you to confirm your account."));
      setBusy(false);
      return;
    }
    await done();
  };

  // The website's reset page cannot finish a reset started in the app, so it runs there.
  const openWebsiteReset = async () => {
    try {
      await openExternal(`${WEBSITE_ORIGIN}/login`);
    } catch {
      setError(l("Tarayıcı açılamadı.", "Couldn't open the browser."));
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await signInWithProvider("google", destination);
    if (result.ok) {
      // The Google photo may have just filled an empty profile picture (src/mobile/googleAvatar.ts).
      refreshProfile();
      await done();
      return;
    }
    // Even a cancelled sign-in says something, so the button never looks like it did nothing.
    if (result.canceled) {
      setNotice(l("Google girişi iptal edildi.", "Google sign-in was cancelled."));
    } else {
      setError(result.error || l("Google ile giriş yapılamadı.", "Couldn't sign in with Google."));
    }
    setBusy(false);
  };

  return (
    <div className="app-light min-h-screen bg-[#ecebe8] flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="w-full max-w-md bg-[#f7f6f4] rounded-3xl p-6 shadow-sm border border-slate-200/60 relative">
        {view === "email" ? (
          <button
            type="button"
            onClick={goBack}
            aria-label={l("Geri", "Back")}
            className="p-2 text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors mb-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : (
          <div aria-hidden="true" className="h-9 mb-2" />
        )}

        <div className="relative w-full h-36 flex items-center justify-center my-2">
          <Badges />
          <Illustration />
        </div>

        {view === "choose" ? (
          <>
            <div className="text-center mt-2 mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {l("Hoş geldin", "Welcome")}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {l("Nasıl devam etmek istediğini seç.", "Choose how you want to continue.")}
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setView("email")}
                className="w-full py-3.5 bg-white hover:bg-slate-50 border-2 border-slate-900 rounded-full text-sm font-semibold text-slate-900 flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Mail className="w-4 h-4" />
                {l("E-posta ile devam et", "Continue with Email")}
              </button>
              {isGoogleSignInEnabled() && (
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={busy}
                  className="w-full py-3.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-full text-sm font-semibold text-slate-800 flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
                  {l("Google ile devam et", "Continue with Google")}
                </button>
              )}
            </div>

            {error && <p className="mt-4 text-center text-xs font-medium text-red-600">{error}</p>}

            <LegalNote />
          </>
        ) : (
          <>
            <div className="text-center mt-2 mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {isSignUp ? l("Hesabını oluştur", "Create your account") : l("Tekrar hoş geldin", "Welcome back")}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {isSignUp
                  ? l("İris'le sohbet etmek ve sohbetlerini saklamak için kaydol.", "Sign up to chat with Iris and keep your chats.")
                  : l("Devam etmek için giriş yap.", "Sign in to continue.")}
              </p>
            </div>

            <div className="bg-[#e4e2dd] p-1 rounded-2xl flex items-center mb-6">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setError("");
                }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  !isSignUp ? "bg-[#c4b5fd] text-slate-900 shadow-sm border border-slate-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {l("Giriş yap", "Log in")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setError("");
                }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  isSignUp ? "bg-[#c4b5fd] text-slate-900 shadow-sm border border-slate-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {l("Kaydol", "Sign up")}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">{l("E-posta", "Email")}</label>
                <input
                  type={isSignUp ? "email" : "text"}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete={isSignUp ? "email" : "username"}
                  className="w-full px-4 py-3 bg-white border-2 border-slate-900 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">{l("Şifre", "Password")}</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    className="w-full px-4 py-3 bg-white border-2 border-slate-900 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-slate-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? l("Şifreyi gizle", "Hide password") : l("Şifreyi göster", "Show password")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!isSignUp && (
                  <div className="text-right mt-1.5">
                    <button
                      type="button"
                      onClick={openWebsiteReset}
                      className="text-xs font-medium text-slate-600 hover:underline"
                    >
                      {l("Şifreni mi unuttun?", "Forgot password?")}
                    </button>
                  </div>
                )}
              </div>

              {error && <p className="text-xs font-medium text-red-600">{error}</p>}
              {notice && <p className="text-xs font-medium text-emerald-700">{notice}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 bg-[#c4b5fd] hover:bg-[#b5a3fc] text-slate-900 font-semibold text-sm rounded-2xl border-2 border-slate-900 transition-colors shadow-sm mt-2 disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSignUp ? l("Hesap oluştur", "Create account") : l("Giriş yap", "Log in")}
              </button>
            </form>

            {isGoogleSignInEnabled() && (
              <>
                <div className="relative my-6 text-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-300" />
                  </div>
                  <span className="relative bg-[#f7f6f4] px-3 text-xs text-slate-400">{l("veya", "or")}</span>
                </div>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={busy}
                  className="w-full py-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-full text-sm font-semibold text-slate-800 flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-60"
                >
                  <GoogleIcon />
                  {l("Google ile devam et", "Continue with Google")}
                </button>
              </>
            )}

            {isSignUp && <LegalNote />}
          </>
        )}
      </div>
    </div>
  );
}
