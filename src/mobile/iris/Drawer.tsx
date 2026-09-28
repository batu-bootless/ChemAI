"use client";

// ChemAI: the ☰ menu, laid out as the Gemini app's drawer (the user's reference screenshot): the
// ChemAI wordmark and the chat search; new chat, chat search and the Library; the notebooks (new,
// the latest three, all); the recent chats; and at the bottom the account and the settings. It
// lies under the page, which slides aside as a panel (IrisShell), as in ChatGPT.

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { refreshHistory, useHistory } from "@/lib/ai/historyStore";
import { notebookIdOf, useNotebooks } from "@/lib/notebooks/store";
import { useL } from "@/mobile/i18n";
import Wordmark from "@/mobile/brand/Wordmark";
import { useIrisShell } from "./IrisShell";
import { GearIcon, LibraryIcon, MoreIcon, NewChatIcon, NotebookIcon, PlusIcon, ProtocolIcon, SearchIcon } from "./icons";
import { useOverlay } from "./useOverlay";
import { IRIS } from "./theme";

function Row({
  icon,
  label,
  active,
  onClick,
  inset = false,
}: {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  inset?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`mx-2 flex h-[45px] w-[calc(100%-16px)] items-center rounded-full text-left transition-colors active:bg-[#EAE8E9] ${inset ? "pl-[17px]" : "pl-[13px]"} pr-4`}
      style={{ background: active ? IRIS.row : undefined }}
    >
      {icon && <span className="mr-[11px] grid size-6 shrink-0 place-items-center text-[#0B0B0C]">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-[17px] leading-[22px] text-[#0B0B0C]">{label}</span>
    </button>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <p className="pb-[6px] pl-[25px] pt-[20px] text-[15px] leading-5" style={{ color: IRIS.sub }}>{children}</p>;
}

function planLabel(plan: string | undefined, l: ReturnType<typeof useL>): string {
  if (plan === "pro") return "Pro";
  if (plan === "team") return "Team";
  return l("Ücretsiz", "Free");
}

export default function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const l = useL();
  const router = useRouter();
  const pathname = (usePathname() ?? "/").replace(/\/$/, "") || "/";
  const params = useSearchParams();
  const shell = useIrisShell();
  const { user, profile } = useAuth();
  const history = useHistory();
  const notebooks = useNotebooks();
  const [avatarBroken, setAvatarBroken] = useState(false);
  useOverlay(open, onClose);

  useEffect(() => {
    void refreshHistory();
  }, []);

  const handlers = shell.handlers();
  const activeConversation = handlers.activeConversation ?? null;
  const onChat = pathname === "/dashboard";
  const notebookId = pathname === "/dashboard/notebook" ? params.get("id") : null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const newChat = () => {
    if (onChat && handlers.newChat) {
      onClose();
      handlers.newChat();
      return;
    }
    go("/dashboard/?new=1");
  };

  const openChat = (id: string) => {
    if (onChat && handlers.openConversation) {
      onClose();
      handlers.openConversation(id);
      return;
    }
    go(`/dashboard/?c=${encodeURIComponent(id)}`);
  };

  const recents = history.conversations.filter((conversation) => !notebookIdOf(conversation.surface)).slice(0, 40);
  const name = (user?.username || user?.email?.split("@")[0] || "").toLocaleUpperCase("tr");
  const avatar = !avatarBroken && profile?.avatar ? profile.avatar : "";

  return (
    <div
      role={open ? "dialog" : undefined}
      aria-modal={open ? "true" : undefined}
      aria-label={l("Menü", "Menu")}
      className="iris-ui relative flex h-full w-full flex-col"
      style={{ background: IRIS.bg, paddingTop: "var(--app-safe-top)" }}
    >
      <header className="flex h-[64px] shrink-0 items-center justify-between pl-[22px] pr-[10px] pt-[8px]">
        <Wordmark height={27} />
        <button
          type="button"
          onClick={() => go("/dashboard/search/")}
          aria-label={l("Sohbetlerde ara", "Search chats")}
          className="grid size-11 place-items-center rounded-full text-[#0B0B0C] active:bg-[#EAE8E9]"
        >
          <SearchIcon size={24} />
        </button>
      </header>

      <nav className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[132px] pt-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Row icon={<NewChatIcon />} label={l("Yeni sohbet", "New chat")} active={onChat && !activeConversation} onClick={newChat} />
        <Row icon={<SearchIcon />} label={l("Sohbetlerde arama yapın", "Search chats")} active={pathname === "/dashboard/search"} onClick={() => go("/dashboard/search/")} />
        <Row
          icon={<LibraryIcon />}
          label={l("Kitaplık", "Library")}
          active={pathname === "/dashboard/library" || pathname === "/dashboard/documents"}
          onClick={() => go("/dashboard/library/")}
        />
        <Row icon={<ProtocolIcon />} label={l("Protokoller", "Protocols")} active={pathname === "/dashboard/protocols"} onClick={() => go("/dashboard/protocols/")} />

        <Section>{l("Not defterleri", "Notebooks")}</Section>
        <Row icon={<PlusIcon />} label={l("Yeni not defteri", "New notebook")} active={pathname === "/dashboard/notebooks/new"} onClick={() => go("/dashboard/notebooks/new/")} />
        {notebooks.slice(0, 3).map((notebook) => (
          <Row
            key={notebook.id}
            icon={<NotebookIcon />}
            label={notebook.title}
            active={notebookId === notebook.id}
            onClick={() => go(`/dashboard/notebook/?id=${notebook.id}`)}
          />
        ))}
        <Row icon={<MoreIcon />} label={l("Tüm not defterleri", "All notebooks")} active={pathname === "/dashboard/notebooks"} onClick={() => go("/dashboard/notebooks/")} />

        <Section>{l("Son Kullanılanlar", "Recent")}</Section>
        {history.status === "loading" && recents.length === 0 && (
          <p className="pl-[25px] pt-2 text-[15px]" style={{ color: IRIS.faint }}>
            {l("Yükleniyor…", "Loading…")}
          </p>
        )}
        {history.status === "error" && recents.length === 0 && (
          <p className="pl-[25px] pt-2 text-[15px]" style={{ color: IRIS.faint }}>
            {l("Sohbet geçmişi yüklenemedi.", "Chat history couldn't be loaded.")}
          </p>
        )}
        {history.status === "ready" && recents.length === 0 && (
          <p className="pl-[25px] pt-2 text-[15px]" style={{ color: IRIS.faint }}>
            {l("Henüz sohbet yok.", "No chats yet.")}
          </p>
        )}
        {recents.map((conversation) => (
          <Row
            key={conversation.id}
            inset
            label={conversation.title || l("Adsız sohbet", "Untitled chat")}
            active={activeConversation === conversation.id}
            onClick={() => openChat(conversation.id)}
          />
        ))}
      </nav>

      {/* The account and the settings stay at the bottom; the list fades out under them. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className="h-[72px]" style={{ background: `linear-gradient(to bottom, rgb(250 248 249 / 0), ${IRIS.bg})` }} />
        <div
          className="pointer-events-auto flex items-center pl-[27px] pr-[25px]"
          style={{ background: IRIS.bg, paddingBottom: "calc(var(--app-safe-bottom) + 16px)" }}
        >
          <button type="button" onClick={() => go("/dashboard/account/")} className="flex min-w-0 flex-1 items-center gap-[11px] text-left" aria-label={l("Hesap", "Account")}>
            <span className="grid size-[39px] shrink-0 place-items-center rounded-full p-[2px]" style={{ background: "linear-gradient(135deg, #4F8BF2, #2F6FE4)" }}>
              <span className="grid size-full place-items-center overflow-hidden rounded-full bg-white p-[2px]">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the profile photo from Supabase Storage
                  <img src={avatar} alt="" onError={() => setAvatarBroken(true)} className="size-full rounded-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center rounded-full bg-[#DCE6F9] text-[14px] font-medium text-[#1F4FAE]">{name.slice(0, 1) || "?"}</span>
                )}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[16px] leading-5 tracking-[0.32em] text-[#0B0B0C]">{name}</span>
              <span className="block text-[14px] leading-5" style={{ color: IRIS.sub }}>
                {planLabel(profile?.academyPlan, l)}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => shell.openSettings()}
            aria-label={l("Ayarlar", "Settings")}
            className="grid size-11 shrink-0 place-items-center rounded-full text-[#0B0B0C] active:bg-[#EAE8E9]"
          >
            <GearIcon size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
