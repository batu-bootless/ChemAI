"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";
import WaveGlow from "@/mobile/ai/WaveGlow";
import ActivityCalendar from "./ActivityCalendar";
import {
  UserPen,
  ShieldHalf,
  SlidersHorizontal,
  Database,
  BellRing,
  BellOff,
  CloudUpload,
  Key,
  Download,
  Trash2,
  TriangleAlert,
  CircleCheck,
  Info,
  Eye,
  EyeOff,
  Check,
  X as XIcon,
  Sun,
  Moon,
  MonitorSmartphone,
  Languages,
  Smartphone,
  Laptop,
  ShieldCheck,
  ImageOff,
  Mail,
  LogOut,
  ChevronRight,
  Lock,
  FileText,
  SquarePen,
  BadgeCheck,
  ImagePlus,
  ChevronDown,
  ChevronLeft,
} from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/AuthContext";
import {
  updateAccount,
  updateProfile,
  changePassword,
  deleteAccount,
  exportUserData,
  type NotificationPreferences,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { useL, useLocale, type Translate } from "@/mobile/i18n";
import { DARK_THEME_LOCKED } from "@/mobile/preferencesBoot";
import {
  notificationAccess,
  requestNotificationAccess,
  type NotificationAccess,
} from "@/mobile/deviceNotifications";
import {
  setLanguagePreference,
  setThemePreference,
  usePreferences,
  type Language,
  type ThemePreference,
} from "@/mobile/preferences";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const CONTACT_EMAIL = "info@chemplus.com.tr";
/**
 * The cover photo is uploaded like the avatar; the profile table has no column for it, so this
 * device remembers its address.
 */
const COVER_KEY = "chemplus:account-cover";
const MAX_COVER_WIDTH = 1600;
const MAX_BIO_LENGTH = 280;
const URL_PATTERN = /^https?:\/\/.+/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shrinks a picked photo before it is uploaded. A phone photo is several megabytes and does not
 * need to be; if anything about the resize fails, the original file is uploaded as it is.
 */
async function shrinkForUpload(file: File, maxWidth: number): Promise<Blob> {
  try {
    const dataUrl = await fileToDataUrl(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
    if (!image.width || image.width <= maxWidth) return file;
    const canvas = document.createElement("canvas");
    canvas.width = maxWidth;
    canvas.height = Math.round((image.height / image.width) * maxWidth);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.85);
    });
    return blob ?? file;
  } catch {
    return file;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Chem+ app: texts in Turkish and English (src/mobile/i18n.ts), dates in the chosen language.
const ACTIVE_TAB_KEY = "chemplus:account-tab";

function formatDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined, locale: string, l: Translate) {
  if (!iso) return l("Henüz değiştirilmedi", "Not changed yet");
  return new Date(iso).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseUserAgent(ua: string): { browser: string | null; os: string | null; isMobile: boolean } {
  let browser: string | null = null;
  if (/Edg\//.test(ua)) browser = "Microsoft Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Google Chrome";
  else if (/Firefox\//.test(ua)) browser = "Mozilla Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";

  let os: string | null = null;
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return { browser, os, isMobile: /Mobi|Android|iPhone/.test(ua) };
}

function getPasswordStrength(
  password: string,
  l: Translate
): { score: 0 | 1 | 2 | 3 | 4; label: string; barColor: string; textColor: string } {
  if (!password) return { score: 0, label: "", barColor: "bg-gray-200", textColor: "text-gray-400" };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const meta = [
    { label: l("Çok zayıf", "Very weak"), barColor: "bg-red-500", textColor: "text-red-600" },
    { label: l("Zayıf", "Weak"), barColor: "bg-red-500", textColor: "text-red-600" },
    { label: l("Orta", "Fair"), barColor: "bg-yellow-500", textColor: "text-yellow-600" },
    { label: l("Güçlü", "Strong"), barColor: "bg-blue-500", textColor: "text-blue-600" },
    { label: l("Çok güçlü", "Very strong"), barColor: "bg-emerald-500", textColor: "text-emerald-600" },
  ][clamped];
  return { score: clamped, ...meta };
}

const inputClass =
  "w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition";
const inputOkClass = "border-gray-200 focus:border-brand-purple focus:ring-brand-purple";
const inputErrorClass = "border-red-300 bg-red-50/60 focus:border-red-400 focus:ring-red-400";

const SETTINGS_TABS: { value: string; label: [tr: string, en: string]; icon: React.ReactNode }[] = [
  { value: "profile", label: ["Profil", "Profile"], icon: <UserPen className="h-4 w-4" /> },
  { value: "security", label: ["Güvenlik", "Security"], icon: <ShieldHalf className="h-4 w-4" /> },
  { value: "notifications", label: ["Bildirimler", "Notifications"], icon: <BellRing className="h-4 w-4" /> },
  { value: "settings", label: ["Tercihler", "Preferences"], icon: <SlidersHorizontal className="h-4 w-4" /> },
  { value: "data", label: ["Veri", "Data"], icon: <Database className="h-4 w-4" /> },
  // Chem+ app: no "Plan" tab - Google Play does not allow selling memberships through the
  // website's checkout from inside the app.
];

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
          <TriangleAlert className="h-3 w-3 shrink-0" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  visible,
  onToggleVisible,
  placeholder,
  minLength,
  required,
  autoComplete,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  autoComplete?: string;
  error?: string;
}) {
  const l = useL();
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${inputClass} ${error ? inputErrorClass : inputOkClass} pr-10`}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        aria-label={visible ? l("Şifreyi gizle", "Hide password") : l("Şifreyi göster", "Show password")}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** Section of a settings surface: bold title + muted description, rows below
 * separated by hairline dividers (not individually boxed) - the flowing
 * list/divider pattern instead of one bordered card per setting. */
/**
 * One settings card, closed until it is asked for.
 *
 * The account page is a long column of forms most people open once and never touch again; showing
 * every field at once makes the two or three that matter today hard to find. The header stays
 * visible, so the page still reads as a list of what is in here.
 *
 * The body stays mounted while closed - collapsed by grid rows rather than unmounted - so a form
 * keeps whatever was typed into it, and `inert` keeps the hidden fields out of the tab order.
 */
function CollapsiblePanel({
  title,
  description,
  children,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`overflow-hidden rounded-2xl border border-gray-200 bg-white ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-6 py-5 text-left transition active:bg-gray-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-5 text-gray-900">{title}</span>
          {description && <span className="mt-1 block text-sm leading-5 text-gray-500">{description}</span>}
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-gray-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* The rows are set here rather than through a utility class: Tailwind does not emit an
          fr-valued grid-rows-[...], so the panel would open to nothing. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="px-6 pb-6">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** One row inside a CollapsiblePanel: label + description on the left,
 * a single control (switch, input, buttons...) on the right. Spacing
 * (12px vertical padding, 28px column gap, 4px label-description gap,
 * hairline 5%-black divider) matches claude.ai/code's Settings modal,
 * measured directly via getComputedStyle(). */
function SettingsRow({
  title,
  description,
  badge,
  control,
}: {
  title: string;
  description?: string;
  badge?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-7">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm leading-5 text-gray-900">{title}</p>
          {badge && (
            <span className="rounded-full bg-brand-purple/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-purple">
              {badge}
            </span>
          )}
        </div>
        {description && <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function ToggleRow({
  checked,
  onCheckedChange,
  title,
  description,
  badge,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <SettingsRow
      title={title}
      description={description}
      badge={badge}
      control={<Switch checked={checked} onCheckedChange={onCheckedChange} />}
    />
  );
}

function ThemeCard({
  active,
  onClick,
  icon,
  title,
  locked,
  lockedLabel,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  /** The choice is not available yet: it shows a padlock and cannot be picked. */
  locked?: boolean;
  lockedLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      aria-disabled={locked}
      title={locked ? lockedLabel : undefined}
      className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-semibold transition ${
        locked
          ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
          : active
          ? "border-brand-purple bg-brand-purple/5 text-brand-purple ring-1 ring-brand-purple"
          : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
      }`}
    >
      {locked && (
        <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-gray-200 text-gray-500">
          <Lock className="size-3" />
        </span>
      )}
      <span
        className={`grid h-9 w-9 place-items-center rounded-full ${
          locked ? "bg-white text-gray-300" : active ? "bg-brand-purple text-white" : "bg-white text-gray-400"
        }`}
      >
        {icon}
      </span>
      {title}
      {!locked && active && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function AccountSettings({ variant = "page" }: { variant?: "page" | "modal" }) {
  const { user, profile, refreshProfile, logout } = useAuth();
  const router = useRouter();
  const l = useL();
  const locale = useLocale();
  const preferences = usePreferences();
  const reduceMotion = useReducedMotion();
  const deleteWord = l("SİL", "DELETE");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // The contact address and logout sit at the bottom of the page.
  const contactEmail = CONTACT_EMAIL;
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deviceAccess, setDeviceAccess] = useState<NotificationAccess>("prompt");
  useEffect(() => {
    void notificationAccess().then(setDeviceAccess);
  }, []);

  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar || "");
  const [coverBusy, setCoverBusy] = useState(false);
  const [cover, setCover] = useState(() => {
    try {
      return window.localStorage.getItem(COVER_KEY) ?? "";
    } catch {
      return "";
    }
  });
  // Account always opens on the profile. The section is only carried over when the page mounts
  // again right away, which is what changing the language does (src/mobile/AppPreferences.tsx).
  const [activeTab, setActiveTabState] = useState(() => {
    try {
      const [tab, at] = (window.sessionStorage.getItem(ACTIVE_TAB_KEY) ?? "").split("@");
      return tab && Date.now() - Number(at) < 10_000 ? tab : "profile";
    } catch {
      return "profile";
    }
  });
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    try {
      window.sessionStorage.setItem(ACTIVE_TAB_KEY, `${tab}@${Date.now()}`);
    } catch {
      // storage unavailable: the section just isn't carried over
    }
  };
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [location, setLocation] = useState(profile?.location || "");
  const [birthDate, setBirthDate] = useState(profile?.birthDate || "");
  const [website, setWebsite] = useState(profile?.website || "");
  const [twitter, setTwitter] = useState(profile?.twitter || "");
  const [linkedin, setLinkedin] = useState(profile?.linkedin || "");
  const [github, setGithub] = useState(profile?.github || "");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const [profileBaseline, setProfileBaseline] = useState({
    username: user?.username || "",
    email: user?.email || "",
    bio: profile?.bio || "",
    location: profile?.location || "",
    birthDate: profile?.birthDate || "",
    website: profile?.website || "",
    twitter: profile?.twitter || "",
    linkedin: profile?.linkedin || "",
    github: profile?.github || "",
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(profile?.twoFactorEnabled ?? false);

  const [notifications, setNotifications] = useState<NotificationPreferences>(
    profile?.notifications ?? { security: true, product: true, community: false }
  );

  const [device] = useState(() =>
    typeof navigator !== "undefined" ? parseUserAgent(navigator.userAgent) : null
  );

  const isProfileDirty = useMemo(() => {
    return (
      username !== profileBaseline.username ||
      email !== profileBaseline.email ||
      bio !== profileBaseline.bio ||
      location !== profileBaseline.location ||
      birthDate !== profileBaseline.birthDate ||
      website !== profileBaseline.website ||
      twitter !== profileBaseline.twitter ||
      linkedin !== profileBaseline.linkedin ||
      github !== profileBaseline.github
    );
  }, [username, email, bio, location, birthDate, website, twitter, linkedin, github, profileBaseline]);


  /** Opens a section from the menu and starts it at the top of the page. */
  function openTab(tab: string) {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!user) return null;

  function showMessage(type: "success" | "error" | "info", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }

  function validateProfileForm() {
    const errors: Record<string, string> = {};
    const urlError = l("http:// veya https:// ile başlamalı.", "Must start with http:// or https://.");
    const uname = username.trim();
    if (uname.length < 3) errors.username = l("Kullanıcı adı en az 3 karakter olmalı.", "Username must be at least 3 characters.");
    else if (/\s/.test(uname)) errors.username = l("Kullanıcı adı boşluk içeremez.", "Username can't contain spaces.");
    if (!EMAIL_PATTERN.test(email.trim())) errors.email = l("Geçerli bir e-posta adresi girin.", "Enter a valid email address.");
    if (bio.length > MAX_BIO_LENGTH) errors.bio = l(`Biyografi en fazla ${MAX_BIO_LENGTH} karakter olabilir.`, `Bio can be at most ${MAX_BIO_LENGTH} characters.`);
    if (website && !URL_PATTERN.test(website)) errors.website = urlError;
    if (twitter && !URL_PATTERN.test(twitter)) errors.twitter = urlError;
    if (linkedin && !URL_PATTERN.test(linkedin)) errors.linkedin = urlError;
    if (github && !URL_PATTERN.test(github)) errors.github = urlError;
    return errors;
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showMessage("error", l("Lütfen bir görsel dosyası seçin (PNG, JPG, WEBP...).", "Please choose an image file (PNG, JPG, WEBP...)."));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      showMessage("error", l("Görsel boyutu 2 MB'ı geçemez.", "The image can't be larger than 2 MB."));
      return;
    }
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const path = `${user!.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarPreview(data.publicUrl);
      await updateProfile(user!.id, { avatar: data.publicUrl });
      await refreshProfile();
      showMessage("success", l("Profil fotoğrafı güncellendi!", "Profile photo updated!"));
    } catch (err) {
      console.error("Avatar yüklenemedi", err);
      showMessage("error", l("Fotoğraf yüklenemedi. Lütfen tekrar deneyin.", "The photo couldn't be uploaded. Please try again."));
    }
  }

  async function handleAvatarRemove() {
    setAvatarPreview("");
    try {
      await updateProfile(user!.id, { avatar: "" });
      await refreshProfile();
      showMessage("info", l("Profil fotoğrafı kaldırıldı.", "Profile photo removed."));
    } catch (err) {
      console.error("Kaldırılamadı", err);
      showMessage("error", l("Fotoğraf kaldırılamadı. Lütfen tekrar deneyin.", "The photo couldn't be removed. Please try again."));
    }
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showMessage("error", l("Lütfen bir görsel dosyası seçin (PNG, JPG, WEBP...).", "Please choose an image file (PNG, JPG, WEBP...)."));
      return;
    }
    setCoverBusy(true);
    try {
      const blob = await shrinkForUpload(file, MAX_COVER_WIDTH);
      const supabase = createClient();
      const ext = blob.type === "image/jpeg" ? "jpg" : file.name.split(".").pop() || "jpg";
      const path = `${user!.id}/cover-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true,
        contentType: blob.type || file.type,
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      try {
        window.localStorage.setItem(COVER_KEY, data.publicUrl);
      } catch {
        // storage unavailable: the cover lasts for this session
      }
      setCover(data.publicUrl);
      showMessage("success", l("Kapak fotoğrafı güncellendi!", "Cover photo updated!"));
    } catch (err) {
      console.error("Kapak yüklenemedi", err);
      const detail = err instanceof Error ? err.message : String(err);
      showMessage("error", `${l("Kapak fotoğrafı yüklenemedi", "The cover photo couldn't be uploaded")}: ${detail}`);
    } finally {
      setCoverBusy(false);
    }
  }

  function handleCoverRemove() {
    setCover("");
    try {
      window.localStorage.removeItem(COVER_KEY);
    } catch {
      // storage unavailable: nothing to clean up
    }
    showMessage("info", l("Kapak fotoğrafı kaldırıldı.", "Cover photo removed."));
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateProfileForm();
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) {
      showMessage("error", l("Lütfen formdaki hataları düzeltin.", "Please fix the errors in the form."));
      return;
    }
    const result = await updateAccount(user!.id, profileBaseline.username, {
      username: username.trim(),
      email: email.trim(),
    });
    if (!result.ok) {
      showMessage("error", result.error);
      return;
    }
    await updateProfile(user!.id, { bio, location, birthDate, website, twitter, linkedin, github });
    await refreshProfile();
    setProfileBaseline({ username, email, bio, location, birthDate, website, twitter, linkedin, github });
    showMessage(
      "success",
      email.trim() !== profileBaseline.email
        ? l(
            "Profil bilgileriniz güncellendi! Yeni e-postanızı onaylamak için gelen bağlantıya tıklayın.",
            "Your profile was updated! Click the link we sent to confirm your new email."
          )
        : l("Profil bilgileriniz güncellendi!", "Your profile was updated!")
    );
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showMessage("error", l("Yeni şifreler eşleşmiyor.", "The new passwords don't match."));
      return;
    }
    const result = await changePassword(user!.id, user!.email, currentPassword, newPassword);
    if (!result.ok) {
      showMessage("error", result.error);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    showMessage("success", l("Şifreniz başarıyla güncellendi!", "Your password was updated!"));
  }

  async function handleTwoFactorSave(e: React.FormEvent) {
    e.preventDefault();
    await updateProfile(user!.id, { twoFactorEnabled });
    await refreshProfile();
    showMessage("success", l("Güvenlik tercihleriniz kaydedildi!", "Your security settings were saved!"));
  }

  async function handleNotificationsSave(e: React.FormEvent) {
    e.preventDefault();
    await updateProfile(user!.id, { notifications });
    await refreshProfile();
    showMessage("success", l("Bildirim tercihleriniz kaydedildi!", "Your notification settings were saved!"));
  }

  // Chem+ app: theme and language apply at once and are saved to the profile in the background.
  function chooseTheme(theme: ThemePreference) {
    setThemePreference(theme);
    // The profile row only accepts the website's three themes, so the app's own paper theme is
    // stored as the light one it is a shade of; the device keeps the real choice.
    const shared: ThemePreference = theme === "paper" ? "light" : theme;
    updateProfile(user!.id, { themePreference: shared }).catch((err) =>
      console.error("Theme preference could not be saved", err)
    );
  }

  function chooseLanguage(language: Language) {
    if (language === preferences.language) return;
    updateProfile(user!.id, { languagePreference: language }).catch((err) =>
      console.error("Language preference could not be saved", err)
    );
    setActiveTab(activeTab); // the page mounts again in the new language: stay in this section
    setLanguagePreference(language);
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText.trim().toLocaleUpperCase(locale) !== deleteWord) return;
    const result = await deleteAccount();
    if (!result.ok) {
      showMessage("error", result.error);
      return;
    }
    router.push("/");
  }

  function handleLogout() {
    setLogoutOpen(false);
    logout();
    router.push("/login");
  }

  const initial = username[0]?.toUpperCase() || "U";
  const headline = profile?.bio?.trim() || profile?.location?.trim() || email;
  const themeLockNote = l(
    "Koyu tema hazırlanıyor, yakında açılacak. Uygulama şimdilik açık temada çalışıyor.",
    "The dark theme is being prepared and will open soon. For now the app stays light."
  );
  const security = { memberSince: user.createdAt, passwordUpdatedAt: profile?.passwordUpdatedAt ?? null };
  const passwordStrength = getPasswordStrength(newPassword, l);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canDelete = deleteConfirmText.trim().toLocaleUpperCase(locale) === deleteWord;

  return (
    <div className={variant === "page" ? "min-h-screen bg-[#f6f8fb] px-4 py-6 sm:px-8 sm:py-8" : ""}>
      <div className="mx-auto max-w-5xl">
        {/* Chem+ app: profile header - a cover photo with the avatar over its bottom edge, the
            name and headline under it, and the account sections in the pill bar. */}
        {variant === "page" && (
          <header className="relative mb-6">
            {/* Iris's light, as in the chat (WaveGlow), turned to shine down from the top: slow
                blue waves behind the cover and the photo that melt into the page. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-4 bottom-0 top-[calc(-1.5rem-var(--app-safe-top))] overflow-hidden sm:-inset-x-8 sm:-top-8 dark:opacity-50"
            >
              <div className="size-full -scale-y-100">
                <WaveGlow active={false} still={Boolean(reduceMotion)} />
              </div>
            </div>

            <div className="relative">
              {/* Cover photo. It is kept on this device, so it never leaves the phone. */}
              <div className="relative aspect-[207/100] w-full overflow-hidden rounded-[20px] bg-[#3d2334]">
                {cover ? (
                  <img src={cover} alt="" className="size-full object-cover" />
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-br from-[#93627f] via-[#6d445e] to-[#3d2334]"
                    />
                    <span aria-hidden="true" className="absolute -right-10 -top-16 size-48 rounded-full bg-[#f3c6de]/30 blur-2xl" />
                    <span aria-hidden="true" className="absolute -left-14 top-6 size-40 rounded-full bg-[#7ad4d8]/20 blur-2xl" />
                    <span aria-hidden="true" className="app-glass-hero absolute inset-0" />
                  </>
                )}
                {/* The picker opens on the tap itself: a phone blocks one opened from a menu that
                    closes at the same moment. */}
                {/* ChemAI: Iris is the main screen; this page is opened from its header. */}
                <button
                  type="button"
                  onClick={() => (window.history.length > 1 ? router.back() : router.replace("/dashboard/"))}
                  aria-label={l("İris'e dön", "Back to Iris")}
                  className="absolute left-3 top-3 grid size-9 place-items-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur-md transition active:scale-95 hover:bg-black/40"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="absolute right-3 top-3 flex gap-2">
                  {cover && (
                    <button
                      type="button"
                      onClick={handleCoverRemove}
                      aria-label={l("Kapağı kaldır", "Remove cover")}
                      className="grid size-9 place-items-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur-md transition active:scale-95 hover:bg-black/40"
                    >
                      <ImageOff className="size-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={coverBusy}
                    aria-label={l("Kapak fotoğrafı seç", "Choose cover photo")}
                    className="grid size-9 place-items-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur-md transition active:scale-95 hover:bg-black/40 disabled:opacity-60"
                  >
                    {coverBusy ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <ImagePlus className="size-4" />
                    )}
                  </button>
                </div>
                <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
              </div>

              {/* The avatar sits over the cover: its white ring only shows against the photo. */}
              <div className="-mt-[73px] flex justify-center">
                <div className="relative">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt={username}
                      className="size-[92px] rounded-full object-cover ring-[8px] ring-white dark:ring-black"
                    />
                  ) : (
                    <div className="grid size-[92px] place-items-center rounded-full bg-[#6d445e] text-3xl font-bold text-white ring-[8px] ring-white dark:ring-black">
                      {initial}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    aria-label={l("Fotoğraf yükle", "Upload photo")}
                    className="absolute -bottom-0.5 -right-0.5 grid size-9 place-items-center rounded-full bg-white text-[#0a66f5] shadow-[0_4px_10px_-4px_rgb(0_0_0/0.5)] transition active:scale-95"
                  >
                    <SquarePen className="size-[18px]" />
                  </button>
                  <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </div>
              </div>
            </div>

            <h1 className="relative mt-6 flex items-center justify-center gap-1.5 px-6 text-[22px] font-bold tracking-tight text-gray-900 dark:text-white">
              <span className="truncate">{username}</span>
              <BadgeCheck className="size-[22px] shrink-0 fill-[#0a66f5] text-white dark:text-[#0b0b0c]" />
            </h1>
            {headline && (
              <p className="relative mt-1 truncate px-6 text-center text-[16px] text-gray-500 dark:text-[#9c9ca1]">{headline}</p>
            )}
            {avatarPreview && (
              <div className="relative mt-1.5 flex justify-center">
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-400 transition hover:text-gray-600 dark:hover:text-white"
                >
                  <ImageOff className="size-3.5" /> {l("Fotoğrafı kaldır", "Remove photo")}
                </button>
              </div>
            )}

            <ActivityCalendar />

            {/* The account sections, in the reference's pill bar. */}
            <nav className="relative mt-5 overflow-x-auto rounded-full border-[1.5px] border-[#cfe0ff] bg-white p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-white/10 dark:bg-[#1c1c1e] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max gap-1">
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => openTab(tab.value)}
                    className={`shrink-0 rounded-full px-4 py-2 text-[15px] transition ${
                      activeTab === tab.value
                        ? "bg-[#e8f0ff] font-bold text-gray-900 dark:bg-white/10 dark:text-white"
                        : "font-medium text-gray-500 dark:text-[#9c9ca1]"
                    }`}
                  >
                    {l(...tab.label)}
                  </button>
                ))}
              </div>
            </nav>
          </header>
        )}

        {message && (
          <div
            className={`mb-6 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : message.type === "info"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.type === "success" ? (
              <CircleCheck className="h-4 w-4 shrink-0" />
            ) : message.type === "info" ? (
              <Info className="h-4 w-4 shrink-0" />
            ) : (
              <TriangleAlert className="h-4 w-4 shrink-0" />
            )}
            {message.text}
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(String(v))}
          orientation="vertical"
          className="flex-col items-stretch gap-4 md:flex-row md:items-start md:gap-8"
        >
          <div className="min-w-0 flex-1">

          <TabsContent value="profile">
            <form onSubmit={handleProfileSave} className="space-y-6">
              <div className="grid gap-6">
                <CollapsiblePanel
                  title={l("Temel Bilgiler", "Basic Information")}
                  description={l("Hesabın için kullanılan ana bilgileri güncelle.", "Update the main details of your account.")}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={l("Kullanıcı Adı", "Username")} error={profileErrors.username}>
                      <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className={`${inputClass} ${profileErrors.username ? inputErrorClass : inputOkClass}`}
                      />
                    </Field>
                    <Field label={l("E-posta", "Email")} error={profileErrors.email}>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`${inputClass} ${profileErrors.email ? inputErrorClass : inputOkClass}`}
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field
                        label={l("Biyografi", "Bio")}
                        error={profileErrors.bio}
                        hint={`${bio.length}/${MAX_BIO_LENGTH} ${l("karakter", "characters")}`}
                      >
                        <textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          rows={3}
                          maxLength={MAX_BIO_LENGTH + 40}
                          placeholder={l(
                            "Kendinizi, çalışma alanınızı veya ilgi duyduğunuz kimya konularını yazın...",
                            "Tell others about yourself, your field or the chemistry topics you like..."
                          )}
                          className={`${inputClass} ${profileErrors.bio ? inputErrorClass : inputOkClass}`}
                        />
                      </Field>
                    </div>
                    <Field label={l("Konum", "Location")}>
                      <input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={l("Şehir, ülke", "City, country")}
                        className={`${inputClass} ${inputOkClass}`}
                      />
                    </Field>
                    <Field label={l("Doğum Tarihi", "Date of Birth")}>
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className={`${inputClass} ${inputOkClass}`}
                      />
                    </Field>
                  </div>
                </CollapsiblePanel>
              </div>

              <CollapsiblePanel
                title={l("Bağlantılar", "Links")}
                description={l("Akademik profilini ve sosyal bağlantılarını ekle.", "Add your academic profile and social links.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={l("Web Sitesi", "Website")} error={profileErrors.website}>
                    <input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://"
                      className={`${inputClass} ${profileErrors.website ? inputErrorClass : inputOkClass}`}
                    />
                  </Field>
                  <Field label="X / Twitter" error={profileErrors.twitter}>
                    <input
                      value={twitter}
                      onChange={(e) => setTwitter(e.target.value)}
                      placeholder="https://x.com/..."
                      className={`${inputClass} ${profileErrors.twitter ? inputErrorClass : inputOkClass}`}
                    />
                  </Field>
                  <Field label="LinkedIn" error={profileErrors.linkedin}>
                    <input
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      className={`${inputClass} ${profileErrors.linkedin ? inputErrorClass : inputOkClass}`}
                    />
                  </Field>
                  <Field label="GitHub" error={profileErrors.github}>
                    <input
                      value={github}
                      onChange={(e) => setGithub(e.target.value)}
                      placeholder="https://github.com/..."
                      className={`${inputClass} ${profileErrors.github ? inputErrorClass : inputOkClass}`}
                    />
                  </Field>
                </div>
              </CollapsiblePanel>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={!isProfileDirty}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-purple px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-purple/90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
                >
                  <CloudUpload className="h-4 w-4" />
                  {l("Değişiklikleri Kaydet", "Save Changes")}
                </button>
                {isProfileDirty && (
                  <span className="text-xs font-semibold text-gray-400">{l("Kaydedilmemiş değişiklikler var", "You have unsaved changes")}</span>
                )}
              </div>
            </form>
          </TabsContent>

          <TabsContent value="security">
            <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
              <div className="space-y-6">
                <form onSubmit={handlePasswordSave}>
                  <CollapsiblePanel
                    title={l("Şifreni güvenli biçimde yenile", "Change your password safely")}
                    description={l("Güçlü ve benzersiz bir şifre kullanarak hesabını koru.", "Protect your account with a strong, unique password.")}
                  >
                    <div className="space-y-5">

                        <Field label={l("Mevcut Şifre", "Current Password")}>
                          <PasswordInput
                            value={currentPassword}
                            onChange={setCurrentPassword}
                            visible={showCurrentPassword}
                            onToggleVisible={() => setShowCurrentPassword((v) => !v)}
                            required
                            autoComplete="current-password"
                          />
                        </Field>

                        <div>
                          <Field label={l("Yeni Şifre", "New Password")}>
                            <PasswordInput
                              value={newPassword}
                              onChange={setNewPassword}
                              visible={showNewPassword}
                              onToggleVisible={() => setShowNewPassword((v) => !v)}
                              required
                              minLength={6}
                              autoComplete="new-password"
                            />
                          </Field>
                          {newPassword && (
                            <div className="mt-2">
                              <div className="flex h-1.5 gap-1 overflow-hidden rounded-full">
                                {[0, 1, 2, 3].map((i) => (
                                  <span
                                    key={i}
                                    className={`flex-1 rounded-full transition-colors ${
                                      i <= passwordStrength.score - 1 || (passwordStrength.score === 0 && i === 0)
                                        ? passwordStrength.barColor
                                        : "bg-gray-200"
                                    }`}
                                  />
                                ))}
                              </div>
                              <p className={`mt-1 text-xs font-semibold ${passwordStrength.textColor}`}>
                                {l("Şifre gücü", "Password strength")}: {passwordStrength.label}
                              </p>
                            </div>
                          )}
                        </div>

                        <Field label={l("Yeni Şifre (Tekrar)", "Confirm New Password")}>
                          <PasswordInput
                            value={confirmPassword}
                            onChange={setConfirmPassword}
                            visible={showConfirmPassword}
                            onToggleVisible={() => setShowConfirmPassword((v) => !v)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            error={passwordsMismatch ? l("Şifreler eşleşmiyor.", "The passwords don't match.") : undefined}
                          />
                          {passwordsMatch && (
                            <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                              <Check className="h-3 w-3" /> {l("Şifreler eşleşiyor", "The passwords match")}
                            </p>
                          )}
                          {passwordsMismatch && (
                            <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                              <XIcon className="h-3 w-3" /> {l("Şifreler eşleşmiyor", "The passwords don't match")}
                            </p>
                          )}
                        </Field>

                        <button
                          type="submit"
                          className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-bold text-white hover:bg-black transition"
                        >
                          <Key className="h-4 w-4" />
                          {l("Şifreyi Güncelle", "Update Password")}
                        </button>
                    </div>
                  </CollapsiblePanel>
                </form>

                <form onSubmit={handleTwoFactorSave}>
                  <CollapsiblePanel
                    title={l("İki Adımlı Doğrulama", "Two-Step Verification")}
                    description={l("Hesabına ekstra bir güvenlik katmanı ekle.", "Add an extra layer of security to your account.")}
                  >
                    <div className="divide-y divide-gray-900/5">
                        <ToggleRow
                          checked={twoFactorEnabled}
                          onCheckedChange={setTwoFactorEnabled}
                          title={l("İki adımlı doğrulamayı etkinleştir", "Turn on two-step verification")}
                          description={l(
                            "Etkinleştirildiğinde yeni bir cihazdan girişte ek bir doğrulama adımı istenir.",
                            "When it's on, signing in from a new device asks for an extra verification step."
                          )}
                          badge={l("Önerilir", "Recommended")}
                        />
                    </div>
                    <button
                      type="submit"
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-purple px-5 py-3 text-sm font-bold text-white hover:bg-brand-purple/90 transition"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {l("Güvenlik Tercihini Kaydet", "Save Security Setting")}
                    </button>
                  </CollapsiblePanel>
                </form>
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">{l("Bu Cihaz", "This Device")}</h4>
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                      {device?.isMobile ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900">{device ? (device.browser ?? l("Bilinmeyen tarayıcı", "Unknown browser")) : l("Algılanıyor...", "Detecting...")}</p>
                      <p className="truncate text-xs text-gray-500">{device ? (device.os ?? l("Bilinmeyen sistem", "Unknown system")) : ""}</p>
                    </div>
                  </div>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {l("Şu anda aktif", "Active now")}
                  </span>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">{l("Güvenlik Özeti", "Security Summary")}</h4>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-gray-500">{l("Üye olma", "Member since")}</dt>
                      <dd className="font-semibold text-gray-900">{formatDate(security.memberSince, locale)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-gray-500">{l("Son şifre değişikliği", "Last password change")}</dt>
                      <dd className="text-right font-semibold text-gray-900">{formatDateTime(security.passwordUpdatedAt, locale, l)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-gray-500">{l("2FA durumu", "2FA status")}</dt>
                      <dd className={`font-semibold ${profile?.twoFactorEnabled ? "text-emerald-600" : "text-gray-400"}`}>
                        {profile?.twoFactorEnabled ? l("Etkin", "On") : l("Kapalı", "Off")}
                      </dd>
                    </div>
                  </dl>
                </div>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            {/* The phone's own notifications: what the timers Iris sets ring through. */}
            <CollapsiblePanel
              title={l("Cihaz bildirimleri", "Phone notifications")}
              description={l(
                "İris'in kurduğu zamanlayıcıların alarmları bu izinle, uygulama kapalıyken bile gelir.",
                "Alarms of the timers Iris sets arrive with this permission, even when the app is closed."
              )}
              className="mb-4 max-w-2xl"
            >
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {deviceAccess === "granted" ? (
                    <>
                      <BellRing className="size-4 text-emerald-600" />
                      <span className="text-emerald-700">{l("Bildirimler açık", "Notifications are on")}</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="size-4 text-gray-400" />
                      <span className="text-gray-600">
                        {deviceAccess === "denied"
                          ? l("Bildirimler kapalı", "Notifications are off")
                          : deviceAccess === "unsupported"
                          ? l("Bu cihazda desteklenmiyor", "Not supported on this device")
                          : l("İzin verilmedi", "Not allowed yet")}
                      </span>
                    </>
                  )}
                </span>
                {deviceAccess === "prompt" && (
                  <button
                    type="button"
                    onClick={async () => setDeviceAccess(await requestNotificationAccess())}
                    className="rounded-xl bg-brand-purple px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-purple/90"
                  >
                    {l("İzin ver", "Allow")}
                  </button>
                )}
              </div>
              {deviceAccess === "denied" && (
                <p className="mt-2 text-xs text-gray-500">
                  {l(
                    "Telefonun ayarlarından ChemAI bildirimlerine izin verdiğinde alarm bildirimleri yeniden çalışır.",
                    "Allow ChemAI notifications in your phone settings and the alarm notifications work again."
                  )}
                </p>
              )}
            </CollapsiblePanel>

            <form onSubmit={handleNotificationsSave} className="max-w-2xl">
              <CollapsiblePanel
                title={l("E-posta bildirimleri", "E-mail notifications")}
                description={l("Hangi konularda e-posta almak istediğini seç.", "Choose which emails you'd like to get.")}
              >
                <div className="divide-y divide-gray-900/5">
                  <ToggleRow
                    checked={notifications.security}
                    onCheckedChange={(v) => setNotifications((n) => ({ ...n, security: v }))}
                    title={l("Güvenlik uyarıları", "Security alerts")}
                    description={l(
                      "Şifre değişikliği, yeni cihaz girişi ve hesap güvenliğiyle ilgili bildirimler.",
                      "Password changes, sign-ins from new devices and other account security notices."
                    )}
                    badge={l("Önerilir", "Recommended")}
                  />
                  <ToggleRow
                    checked={notifications.product}
                    onCheckedChange={(v) => setNotifications((n) => ({ ...n, product: v }))}
                    title={l("Ürün güncellemeleri", "Product updates")}
                    description={l("Yeni özellikler ve duyurular.", "New features and announcements.")}
                  />
                  <ToggleRow
                    checked={notifications.community}
                    onCheckedChange={(v) => setNotifications((n) => ({ ...n, community: v }))}
                    title={l("Akademik güncellemeler", "Academic updates")}
                    description={l(
                      "Kaydettiğin konulardaki yeni makaleler ve akademik kaynak güncellemeleri hakkında bilgilendirme.",
                      "New papers and academic source updates on the topics you saved."
                    )}
                  />
                </div>
                <button
                  type="submit"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-purple px-5 py-3 text-sm font-bold text-white hover:bg-brand-purple/90 transition"
                >
                  {l("Bildirimleri Kaydet", "Save Notifications")}
                </button>
              </CollapsiblePanel>
            </form>
          </TabsContent>

          <TabsContent value="settings">
            <CollapsiblePanel
              title={l("Deneyimini kişiselleştir", "Personalize your experience")}
              description={l("Tema ve dil hemen değişir ve hesabına kaydedilir.", "The theme and language change at once and are saved to your account.")}
              className="max-w-xl"
            >
              <div className="space-y-6">

                <div role="radiogroup" aria-label={l("Tema Tercihi", "Theme")}>
                  <p className="mb-2 block text-sm font-semibold text-gray-700">{l("Tema Tercihi", "Theme")}</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <ThemeCard
                      active={preferences.theme === "light"}
                      onClick={() => chooseTheme("light")}
                      icon={<Sun className="h-4 w-4" />}
                      title={l("Açık", "Light")}
                    />
                    <ThemeCard
                      active={preferences.theme === "paper"}
                      onClick={() => chooseTheme("paper")}
                      icon={<FileText className="h-4 w-4" />}
                      title={l("Kağıt", "Paper")}
                    />
                    <ThemeCard
                      active={preferences.theme === "dark"}
                      onClick={() => chooseTheme("dark")}
                      icon={<Moon className="h-4 w-4" />}
                      title={l("Koyu", "Dark")}
                      locked={DARK_THEME_LOCKED}
                      lockedLabel={themeLockNote}
                    />
                    <ThemeCard
                      active={preferences.theme === "system"}
                      onClick={() => chooseTheme("system")}
                      icon={<MonitorSmartphone className="h-4 w-4" />}
                      title={l("Sistem", "System")}
                      locked={DARK_THEME_LOCKED}
                      lockedLabel={themeLockNote}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {l(
                      "Kağıt teması beyaz yerine sıcak bir krem tonu kullanır; gözü daha az yorar.",
                      "The paper theme uses a warm cream tone instead of white, which is easier on the eyes."
                    )}
                  </p>
                  {DARK_THEME_LOCKED ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                      <Lock className="size-3 shrink-0" /> {themeLockNote}
                    </p>
                  ) : (
                    preferences.theme === "system" && (
                      <p className="mt-2 text-xs text-gray-500">
                        {l("Telefonunun açık/koyu ayarını izler.", "Follows your phone's light/dark setting.")}
                      </p>
                    )
                  )}
                </div>

                <div role="radiogroup" aria-label={l("Dil Seçimi", "Language")}>
                  <p className="mb-2 block text-sm font-semibold text-gray-700">{l("Dil Seçimi", "Language")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <ThemeCard
                      active={preferences.language === "tr"}
                      onClick={() => chooseLanguage("tr")}
                      icon={<Languages className="h-4 w-4" />}
                      title="Türkçe"
                    />
                    <ThemeCard
                      active={preferences.language === "en"}
                      onClick={() => chooseLanguage("en")}
                      icon={<Languages className="h-4 w-4" />}
                      title="English"
                    />
                  </div>
                </div>
              </div>
            </CollapsiblePanel>
          </TabsContent>

          <TabsContent value="data">
            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="text-[15px] font-semibold leading-5 text-gray-900">{l("Verilerini indir", "Download your data")}</h3>
                <p className="mt-1 mb-4 text-sm text-gray-500">
                  {l("Profil, tercih ve güvenlik özetini JSON formatında dışa aktar.", "Export your profile, preferences and security summary as JSON.")}
                </p>
                <button
                  onClick={() => exportUserData(user!, profile!)}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-brand-purple hover:bg-brand-purple/5 transition"
                >
                  <Download className="h-4 w-4" />
                  {l("JSON olarak indir", "Download as JSON")}
                </button>
              </article>

              <article className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="text-[15px] font-semibold leading-5 text-gray-900">{l("Gizlilik politikası", "Privacy policy")}</h3>
                <p className="mt-1 mb-4 text-sm text-gray-500">
                  {l("Hangi verileri neden işlediğimizi ve haklarını oku.", "Read which data we process, why, and your rights.")}
                </p>
                <Link
                  href="/gizlilik/"
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-brand-purple hover:bg-brand-purple/5 transition"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {l("Politikayı aç", "Open the policy")}
                </Link>
              </article>

              <article className="rounded-2xl border border-red-200 bg-white p-6 md:col-span-2">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold leading-5 text-gray-900">
                  <TriangleAlert className="h-4 w-4 text-red-600" />
                  {l("Hesabı sil", "Delete account")}
                </h3>
                <p className="mt-1 mb-4 text-sm text-gray-500">
                  {l("Bu işlem geri alınamaz. Hesabın ve bağlı verilerin kalıcı olarak silinir.", "This can't be undone. Your account and its data are deleted permanently.")}
                </p>
                <button
                  onClick={() => {
                    setDeleteConfirmText("");
                    setDeleteOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition"
                >
                  <Trash2 className="h-4 w-4" />
                  {l("Hesabı Sil", "Delete Account")}
                </button>
              </article>
            </div>
          </TabsContent>

          </div>
        </Tabs>

        {variant === "page" && (
          <div className="mt-10 space-y-6 md:ml-68 md:max-w-xl">
            <section>
              <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-gray-500">{l("Destek", "Support")}</h2>
              <a
                href={`mailto:${contactEmail}`}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 transition active:bg-gray-50"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-b from-[#4f93ff] to-[#1d6cf2] text-white shadow-sm">
                  <Mail className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-gray-900">{l("Bize ulaşın", "Contact us")}</span>
                  <span className="block truncate text-sm text-gray-500">{contactEmail}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-gray-300" />
              </a>
            </section>

            <section>
              <button
                type="button"
                onClick={() => setLogoutOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-[15px] font-semibold text-red-600 transition active:bg-red-50"
              >
                <LogOut className="size-[18px]" />
                {l("Çıkış yap", "Log out")}
              </button>
              <p className="mt-2 px-4 text-xs text-gray-400">{l(`${user.email} ile giriş yapıldı`, `Signed in as ${user.email}`)}</p>
            </section>
          </div>
        )}
      </div>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="z-[110]" overlayClassName="z-[110]">
          <DialogHeader>
            <DialogTitle>{l("Çıkış yapılsın mı?", "Log out?")}</DialogTitle>
            <DialogDescription>
              {l(
                `${user.email} hesabından çıkacaksın. Uygulamayı kullanmak için yeniden giriş yapman gerekecek.`,
                `You'll be signed out of ${user.email}. You'll need to sign in again to use the app.`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
              {l("Vazgeç", "Cancel")}
            </DialogClose>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            >
              <LogOut className="h-4 w-4" />
              {l("Çıkış yap", "Log out")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteConfirmText("");
        }}
      >
        <DialogContent className="z-[110]" overlayClassName="z-[110]">
          <DialogHeader>
            <DialogTitle>{l("Hesabını silmek istediğine emin misin?", "Delete your account?")}</DialogTitle>
            <DialogDescription>
              {l(
                "Bu işlem geri alınamaz. Tüm hesap verilerin kalıcı olarak kaldırılır. Onaylamak için aşağıya",
                "This can't be undone. All of your account data is removed permanently. To confirm, type"
              )}{" "}
              <strong>{deleteWord}</strong> {l("yazın.", "below.")}
            </DialogDescription>
          </DialogHeader>
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={deleteWord}
            className={`${inputClass} ${inputOkClass}`}
            autoFocus
          />
          <DialogFooter>
            <DialogClose className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
              {l("Vazgeç", "Cancel")}
            </DialogClose>
            <button
              onClick={handleDeleteAccount}
              disabled={!canDelete}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              <Trash2 className="h-4 w-4" />
              {l("Kalıcı Olarak Sil", "Delete Permanently")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
