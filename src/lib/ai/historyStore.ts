"use client";

// ChemAI: the chat history, loaded once and shared by the menu's "Son kullanılanlar", the chat
// search and the notebooks. A turn that saves a conversation puts it at the top straight away.

import { useSyncExternalStore } from "react";
import { adoptFromHistory } from "@/lib/notebooks/store";
import { cleanTitle, listAiConversations, type AiConversationSummary } from "./history";

export type HistoryStatus = "idle" | "loading" | "ready" | "error";

interface HistoryState {
  conversations: AiConversationSummary[];
  status: HistoryStatus;
  loadedAt: number;
}

let state: HistoryState = { conversations: [], status: "idle", loadedAt: 0 };
const SERVER_STATE: HistoryState = state;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function set(next: Partial<HistoryState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHistory(): HistoryState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE
  );
}

/** Loads the history again unless it was loaded in the last `maxAgeMs`. */
export function refreshHistory(maxAgeMs = 15_000): Promise<void> {
  if (inflight) return inflight;
  if (state.status === "ready" && Date.now() - state.loadedAt < maxAgeMs) return Promise.resolve();
  if (state.status !== "ready") set({ status: "loading" });
  inflight = listAiConversations(200)
    .then((conversations) => {
      set({ conversations, status: "ready", loadedAt: Date.now() });
      adoptFromHistory(conversations);
    })
    .catch(() => {
      if (state.status !== "ready") set({ status: "error" });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function upsertConversation(conversation: AiConversationSummary): void {
  const clean = { ...conversation, title: cleanTitle(conversation.title) };
  set({ conversations: [clean, ...state.conversations.filter((item) => item.id !== conversation.id)] });
}

export function findConversation(id: string | null | undefined): AiConversationSummary | null {
  return id ? state.conversations.find((item) => item.id === id) ?? null : null;
}
