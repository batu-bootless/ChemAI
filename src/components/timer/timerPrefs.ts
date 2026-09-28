// Chem+ app: what the Timer module remembers on the device: how a finished session announces
// itself, and how loud the alarm and the ambient sound are.
export interface TimerPrefs {
  /** Post a phone notification when a session ends. */
  notify: boolean;
  /** Ring the alarm tone. */
  sound: boolean;
  /** Vibrate with the alarm. */
  vibrate: boolean;
  /** Alarm loudness, 0-1. */
  volume: number;
  /** Ambient loudness, 0-1. */
  ambientVolume: number;
}

export const DEFAULT_TIMER_PREFS: TimerPrefs = {
  notify: true,
  sound: true,
  vibrate: true,
  volume: 0.35,
  ambientVolume: 0.6,
};

const KEY = "chemplus:timer-prefs";

function clamp01(value: unknown, fallback: number): number {
  return typeof value === "number" && value >= 0 && value <= 1 ? value : fallback;
}

export function readTimerPrefs(): TimerPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_TIMER_PREFS;
    const saved = JSON.parse(raw) as Partial<TimerPrefs>;
    return {
      notify: saved.notify ?? DEFAULT_TIMER_PREFS.notify,
      sound: saved.sound ?? DEFAULT_TIMER_PREFS.sound,
      vibrate: saved.vibrate ?? DEFAULT_TIMER_PREFS.vibrate,
      volume: clamp01(saved.volume, DEFAULT_TIMER_PREFS.volume),
      ambientVolume: clamp01(saved.ambientVolume, DEFAULT_TIMER_PREFS.ambientVolume),
    };
  } catch {
    return DEFAULT_TIMER_PREFS;
  }
}

export function writeTimerPrefs(prefs: TimerPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable: the choice lasts for this session
  }
}
