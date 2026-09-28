import { createClient } from "@/lib/supabase/client";
import { textFor } from "@/mobile/i18n";

export const AI_REPORT_REASONS = [
  "Saldırgan veya uygunsuz içerik",
  "Zararlı ya da tehlikeli yönlendirme",
  "Yanlış bilgi",
  "Diğer",
] as const;

export type AiReportReason = (typeof AI_REPORT_REASONS)[number];

const TAG = "[ChemAI · İris yanıtı]";
const MAX_REASON_LENGTH = 1000; // reports.reason check constraint

/**
 * Chem+ app (Google Play AI-generated content policy): lets users flag an AI reply without
 * leaving the app. Reports go to the admin review queue that user reports already use
 * (public.reports), so no database change is needed. That table requires a reported user, so the
 * reporter is recorded there and the tag marks the row as an AI reply report.
 */
export async function reportAiReply(
  reply: string,
  reason: AiReportReason,
  note: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: textFor("Bildirim göndermek için giriş yapmalısınız.", "Sign in to send a report.") };

  const header = [TAG, reason, note.trim()].filter(Boolean).join(" | ");
  const text = `${header}\n---\n${reply.trim()}`.slice(0, MAX_REASON_LENGTH);
  const { error } = await supabase.from("reports").insert({
    reporter_id: auth.user.id,
    reported_user_id: auth.user.id,
    conversation_id: null,
    reason: text,
  });
  if (error) {
    return { ok: false, error: textFor("Bildirim gönderilemedi. Biraz bekleyip tekrar deneyin.", "The report couldn't be sent. Wait a moment and try again.") };
  }
  return { ok: true };
}
