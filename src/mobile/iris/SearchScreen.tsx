"use client";

// ChemAI: "Sohbetlerde arama yapın", laid out as the Gemini app's chat search (the user's
// reference screenshot): the search field under the header, "En yeni" and the chats with their
// dates. Typing filters the titles at once and looks inside the chats' messages as well.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cleanReply, parseUserMessage } from "@/lib/ai/assistant";
import { searchAiMessages } from "@/lib/ai/history";
import { refreshHistory, useHistory } from "@/lib/ai/historyStore";
import { notebookIdOf } from "@/lib/notebooks/store";
import { useL, useLocale } from "@/mobile/i18n";
import { CloseIcon, NotebookIcon, SearchIcon } from "./icons";
import PageHeader, { shortDate } from "./PageHeader";
import { IRIS } from "./theme";

function visible(role: string, content: string): string {
  return role === "user" ? parseUserMessage(content).text : cleanReply(content);
}

export default function SearchScreen() {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const router = useRouter();
  const history = useHistory();
  const [query, setQuery] = useState("");
  const [inside, setInside] = useState<Map<string, string>>(new Map());
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshHistory();
    const id = window.setTimeout(() => input.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, []);

  // The messages are searched a moment after the typing stops.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setInside(new Map());
      setSearching(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const id = window.setTimeout(() => {
      searchAiMessages(text, visible)
        .then((hits) => alive && setInside(hits))
        .catch(() => alive && setInside(new Map()))
        .finally(() => alive && setSearching(false));
    }, 320);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [query]);

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(language === "tr" ? "tr" : "en");
    if (!needle) return history.conversations.map((conversation) => ({ conversation, snippet: "" }));
    return history.conversations
      .map((conversation) => {
        const inTitle = (conversation.title || "").toLocaleLowerCase("tr").includes(needle);
        const snippet = inside.get(conversation.id) ?? "";
        return inTitle || snippet ? { conversation, snippet: inTitle ? "" : snippet } : null;
      })
      .filter((item): item is { conversation: (typeof history.conversations)[number]; snippet: string } => item !== null);
  }, [history.conversations, inside, query, language]);

  const open = (id: string, surface: string) => {
    const notebook = notebookIdOf(surface);
    router.push(notebook ? `/dashboard/notebook/?id=${notebook}&c=${encodeURIComponent(id)}` : `/dashboard/?c=${encodeURIComponent(id)}`);
  };

  return (
    <main className="iris-ui flex min-h-[var(--app-content-h)] flex-col" style={{ background: IRIS.bg }}>
      <PageHeader title={l("Sohbetlerde arama yapın", "Search chats")} />

      <div className="mt-[15px] flex h-11 items-center pl-[21px] pr-[15px]">
        <SearchIcon size={24} className="shrink-0 text-[#0B0B0C]" />
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={l("Sohbet arayın", "Search chats")}
          enterKeyHint="search"
          className="iris-input-17 ml-[12px] h-full min-w-0 flex-1 bg-transparent text-[17px] text-[#0B0B0C] caret-[#0B57D0] outline-none placeholder:text-[#6B696B]"
          aria-label={l("Sohbet arayın", "Search chats")}
        />
        <button
          type="button"
          onClick={() => (query ? setQuery("") : router.back())}
          aria-label={query ? l("Temizle", "Clear") : l("Kapat", "Close")}
          className="grid size-11 shrink-0 place-items-center rounded-full text-[#0B0B0C] active:bg-[#EAE8E9]"
        >
          <CloseIcon size={22} />
        </button>
      </div>
      <div className="mx-3 h-px" style={{ background: IRIS.line }} />

      <p className="pb-[14px] pl-[21px] pt-[22px] text-[15px] leading-5" style={{ color: IRIS.sub }}>
        {query.trim() ? (searching ? l("Aranıyor…", "Searching…") : l("Sonuçlar", "Results")) : l("En yeni", "Newest")}
      </p>

      <div className="pb-[calc(var(--app-safe-bottom)+24px)]">
        {history.status === "loading" && !history.conversations.length && (
          <p className="pl-[21px] text-[15px]" style={{ color: IRIS.faint }}>
            {l("Yükleniyor…", "Loading…")}
          </p>
        )}
        {history.status === "error" && !history.conversations.length && (
          <p className="pl-[21px] text-[15px]" style={{ color: IRIS.faint }}>
            {l("Sohbet geçmişi yüklenemedi.", "Chat history couldn't be loaded.")}
          </p>
        )}
        {history.status === "ready" && !results.length && (
          <p className="pl-[21px] text-[15px]" style={{ color: IRIS.faint }}>
            {query.trim() ? l("Eşleşen sohbet yok.", "No matching chats.") : l("Henüz sohbet yok.", "No chats yet.")}
          </p>
        )}
        {results.map(({ conversation, snippet }) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => open(conversation.id, conversation.surface)}
            className="flex min-h-[45px] w-full items-center gap-3 pl-[21px] pr-[24px] text-left active:bg-[#F2F0F1]"
          >
            <span className="min-w-0 flex-1 py-[10px]">
              <span className="flex items-center gap-1.5">
                {notebookIdOf(conversation.surface) && <NotebookIcon size={16} className="shrink-0" style={{ color: IRIS.sub }} />}
                <span className="truncate text-[17px] leading-[22px] text-[#0B0B0C]">{conversation.title || l("Adsız sohbet", "Untitled chat")}</span>
              </span>
              {snippet && (
                <span className="mt-0.5 block truncate text-[14px] leading-[18px]" style={{ color: IRIS.sub }}>
                  {snippet}
                </span>
              )}
            </span>
            <span className="shrink-0 text-[15px]" style={{ color: IRIS.sub }}>
              {shortDate(conversation.updatedAt, language)}
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
