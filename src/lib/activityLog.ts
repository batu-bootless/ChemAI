import { createClient } from "@/lib/supabase/client";

export type ActivityKind = "calculator" | "timer" | "notebook" | "pdf-search";

export interface RemoteActivityRow {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  href: string;
  occurred_at: string;
}

// Fire-and-forget: activity logging must never break the feature that
// triggered it, so every failure (offline, logged out, RLS edge case) is
// swallowed silently.

// One row per discrete use (fresh random external_id every call).
export function logActivity(kind: ActivityKind, title: string, subtitle: string, href: string, occurredAt?: number): void {
  try {
    const supabase = createClient();
    supabase
      .from("activity_log")
      .insert({
        kind,
        external_id: crypto.randomUUID(),
        title,
        subtitle,
        href,
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      })
      .then(() => {});
  } catch {
    // ignore
  }
}

// One row per logical entity (external_id = the entity's own id) - repeated
// calls update the same row in place instead of growing new ones, matching
// the "one entry per experiment" shape the notebook's activity already had.
export function upsertActivity(kind: ActivityKind, externalId: string, title: string, subtitle: string, href: string): void {
  try {
    const supabase = createClient();
    supabase
      .from("activity_log")
      .upsert(
        { kind, external_id: externalId, title, subtitle, href, occurred_at: new Date().toISOString() },
        { onConflict: "user_id,kind,external_id" }
      )
      .then(() => {});
  } catch {
    // ignore
  }
}

/** Removes one row of the shared log. Best effort: the local hide keeps the screen right either way. */
export function deleteActivityRow(id: string): void {
  try {
    const supabase = createClient();
    supabase.from("activity_log").delete().eq("id", id).then(() => {});
  } catch {
    // ignore
  }
}

export async function fetchActivityLog(limit = 2000): Promise<RemoteActivityRow[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("activity_log")
      .select("id,kind,title,subtitle,href,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
  }
}
