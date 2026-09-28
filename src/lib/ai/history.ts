import { createClient } from "@/lib/supabase/client";
import { textFor } from "@/mobile/i18n";
import type { AiMessage } from "@/lib/ai/client";
import { latexToUnicode } from "@/lib/ai/latex";

export interface AiConversationSummary {
  id: string;
  title: string;
  surface: string;
  updatedAt: number;
}

interface ConversationRow {
  id: string;
  title: string;
  surface: string;
  updated_at: string;
}

/**
 * A chat's title as the user should read it. The website names a conversation after its first
 * message, which in the app carries the engine's blocks (⟦CHEMPLUS-…⟧) after the question.
 */
export function cleanTitle(title: string): string {
  return title.split("⟦")[0].replace(/\s+/g, " ").trim();
}

export async function listAiConversations(limit = 50): Promise<AiConversationSummary[]> {
  const { data, error } = await createClient()
    .from("ai_conversations")
    .select("id,title,surface,updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(textFor("Sohbet geçmişi yüklenemedi.", "Chat history couldn't be loaded."));
  return (data as ConversationRow[]).map((row) => ({
    id: row.id,
    title: cleanTitle(row.title),
    surface: row.surface,
    updatedAt: Date.parse(row.updated_at),
  }));
}

export async function getAiConversationMessages(conversationId: string): Promise<AiMessage[]> {
  const { data, error } = await createClient()
    .from("ai_messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: true });
  if (error) throw new Error(textFor("Sohbet yüklenemedi.", "The chat couldn't be loaded."));
  // Replies saved before LaTeX cleanup existed still contain raw markup.
  return (data as AiMessage[]).map((m) => (m.role === "assistant" ? { ...m, content: latexToUnicode(m.content) } : m));
}

/**
 * Conversations whose messages mention `query` (the chat search looks inside the chats, not only
 * at their titles). The app's own blocks are left out: a hit must be in what the user saw.
 */
export async function searchAiMessages(query: string, visible: (role: string, content: string) => string): Promise<Map<string, string>> {
  const text = query.trim();
  const hits = new Map<string, string>();
  if (text.length < 2) return hits;
  const pattern = `%${text.replace(/[\%_]/g, (char) => `\${char}`)}%`;
  const { data, error } = await createClient()
    .from("ai_messages")
    .select("conversation_id,role,content")
    .ilike("content", pattern)
    .order("id", { ascending: false })
    .limit(80);
  if (error) throw new Error(textFor("Arama yapılamadı.", "The search failed."));
  const needle = text.toLocaleLowerCase("tr");
  for (const row of (data ?? []) as { conversation_id: string; role: string; content: string }[]) {
    if (hits.has(row.conversation_id)) continue;
    const shown = visible(row.role, row.content);
    const at = shown.toLocaleLowerCase("tr").indexOf(needle);
    if (at < 0) continue;
    const start = Math.max(0, at - 30);
    hits.set(row.conversation_id, `${start > 0 ? "…" : ""}${shown.slice(start, at + text.length + 60).replace(/\s+/g, " ").trim()}`);
  }
  return hits;
}
