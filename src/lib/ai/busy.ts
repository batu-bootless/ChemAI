// ChemAI: how busy the AI is. The Gemini limits behind the website are counted per minute and per
// day for all users together (the free tier allows only a few requests a minute per model). When
// the website answers "too many requests", the app waits a little and asks again, and for a few
// minutes spends fewer calls: the planner gives way to the rules, a document is read one part at a
// time. A used-up daily limit is not asked again; it comes back when the day's quota renews.

/** After a busy answer the app saves calls for this long. */
const SAVING_MS = 5 * 60_000;
/** A retry delay the AI asks for beyond this is not waited out: the question fails at once. */
const MAX_WAIT_MS = 30_000;

export class AiBusyError extends Error {
  constructor(
    message: string,
    /** The day's quota is used up: asking again today will not help. */
    readonly daily: boolean,
    /** How long the AI asked to wait before the next request, when it said. */
    readonly retryAfterMs: number | null
  ) {
    super(message);
    this.name = "AiBusyError";
  }
}

let busyUntil = 0;

export function markBusy(now = Date.now()): void {
  busyUntil = now + SAVING_MS;
}

/** True for a few minutes after the AI was found busy: spend as few calls as possible. */
export function aiBusy(now = Date.now()): boolean {
  return now < busyUntil;
}

const BUSY_WORDS = /429|too many|rate.?limit|quota|kota|resource.?exhausted|yoğun|overloaded|unavailable/i;
const DAILY_WORDS = /per.?day|perday|daily|günlük|bugünkü/i;

/**
 * Reads a failed AI response: whether the AI was busy (and if the whole day's quota is gone, and
 * how long it asked to wait), or null for any other failure.
 */
export function busyFrom(status: number, message: string, retryAfter: string | null): { daily: boolean; retryAfterMs: number | null } | null {
  const busy = status === 429 || (status === 503 && !/kurulmamış|not configured/i.test(message)) || (status >= 500 && BUSY_WORDS.test(message));
  if (!busy) return null;
  let waitMs: number | null = null;
  const header = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(header) && header >= 0) waitMs = header * 1000;
  else {
    // Gemini's own words, when the website passes them on: "Please retry in 37.2s", "retryDelay": "37s".
    const said = /retry(?:\s*in|Delay"?\s*:\s*"?)\s*([\d.]+)\s*s/i.exec(message);
    if (said) waitMs = Number(said[1]) * 1000;
  }
  return { daily: DAILY_WORDS.test(message), retryAfterMs: waitMs };
}

/**
 * How long to wait before asking again after `attempt` busy answers (0, 1…), or null when a retry
 * will not help (a used-up day, a wait longer than a question can take). A little randomness keeps
 * phones that were refused together from all asking again in the same second.
 */
export function retryDelay(error: AiBusyError, attempt: number, random = Math.random()): number | null {
  if (error.daily) return null;
  const base = error.retryAfterMs ?? [6_000, 15_000, 25_000][Math.min(attempt, 2)];
  if (base > MAX_WAIT_MS) return null;
  return Math.max(2_000, base) + Math.round(random * 1500);
}
