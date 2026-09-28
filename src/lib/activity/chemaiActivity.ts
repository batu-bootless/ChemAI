"use client";

// ChemAI: what the account page's activity calendar counts - a question to Iris, and each thing
// Iris did for it (a timer, note, protocol, report, graph…), per day.
//
// Two sources, merged per day:
//  - this phone's own count (src/lib/ai/usage.ts): every question and action, temporary chats
//    and chats with history off included;
//  - the questions saved to the account from ChemAI (its chats have an empty surface, its
//    notebooks' chats "📓 …"), so the calendar is the same on another phone or after a reinstall.
// A day takes the larger of the two question counts - the same question is in both when it was
// asked on this phone - plus this phone's actions.

import { createClient } from "@/lib/supabase/client";
import { dayKey, usageLog } from "@/lib/ai/usage";

const PAGE = 1000;
const MAX_PAGES = 20;

/** Questions saved to the account from ChemAI since `since`, per day. Empty when offline or signed out. */
async function savedQuestionsByDay(since: Date): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    const supabase = createClient();
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from("ai_messages")
        .select("id,created_at,ai_conversations!inner(surface)")
        .eq("role", "user")
        .gte("created_at", since.toISOString())
        .or('surface.is.null,surface.eq."",surface.like.📓*', { referencedTable: "ai_conversations" })
        .order("id", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error || !data) break;
      for (const row of data as { created_at: string }[]) {
        const key = dayKey(new Date(row.created_at));
        counts[key] = (counts[key] ?? 0) + 1;
      }
      if (data.length < PAGE) break;
    }
  } catch {
    // the phone's own count still shows
  }
  return counts;
}

/** This phone's activity per day: at once, without the network. */
export function localActivity(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, day] of Object.entries(usageLog())) {
    counts[key] = (day.questions ?? 0) + (day.actions ?? 0);
  }
  return counts;
}

/** The phone's count merged with the account's saved ChemAI questions since 1 January of `year`. */
export async function chemAiActivity(year: number): Promise<Record<string, number>> {
  const saved = await savedQuestionsByDay(new Date(year, 0, 1));
  const local = usageLog();
  const counts: Record<string, number> = {};
  for (const key of new Set([...Object.keys(saved), ...Object.keys(local)])) {
    const day = local[key];
    counts[key] = Math.max(saved[key] ?? 0, day?.questions ?? 0) + (day?.actions ?? 0);
  }
  return counts;
}
