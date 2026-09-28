"use client";

// ChemAI: how much Iris has been used on this device (Settings → Kullanım): questions, engine
// runs, actions done and numbers checked, per day. Nothing leaves the phone.

export interface DayUsage {
  questions: number;
  tools: number;
  actions: number;
  verified: number;
  photos: number;
  voice: number;
}

type UsageLog = Record<string, DayUsage>;

const KEY = "chemai:usage:v1";
const EMPTY: DayUsage = { questions: 0, tools: 0, actions: 0, verified: 0, photos: 0, voice: 0 };

export function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function read(): UsageLog {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as UsageLog;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function countUsage(patch: Partial<DayUsage>): void {
  if (typeof window === "undefined") return;
  const log = read();
  const key = dayKey();
  const day = { ...EMPTY, ...log[key] };
  for (const [name, value] of Object.entries(patch) as [keyof DayUsage, number][]) day[name] += value;
  log[key] = day;
  // Only the last 120 days are kept.
  const keys = Object.keys(log).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 120))) delete log[old];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // storage unavailable: this turn is not counted
  }
}

export interface UsageSummary {
  today: DayUsage;
  week: DayUsage;
  total: DayUsage;
  /** The last 14 days, oldest first, for the bar chart. */
  days: { key: string; questions: number }[];
}

export function usageSummary(): UsageSummary {
  const log = typeof window === "undefined" ? {} : read();
  const sum = (keys: string[]) =>
    keys.reduce<DayUsage>((acc, key) => {
      const day = log[key];
      if (!day) return acc;
      return {
        questions: acc.questions + (day.questions ?? 0),
        tools: acc.tools + (day.tools ?? 0),
        actions: acc.actions + (day.actions ?? 0),
        verified: acc.verified + (day.verified ?? 0),
        photos: acc.photos + (day.photos ?? 0),
        voice: acc.voice + (day.voice ?? 0),
      };
    }, { ...EMPTY });
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(dayKey(date));
  }
  return {
    today: sum([dayKey()]),
    week: sum(days.slice(-7)),
    total: sum(Object.keys(log)),
    days: days.map((key) => ({ key, questions: log[key]?.questions ?? 0 })),
  };
}
