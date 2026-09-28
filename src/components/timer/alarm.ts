// Chem+ app: the alarm that rings when a countdown or a focus session ends.
//
// It is a real alarm rather than a single ding: a three-beep pattern that repeats until the user
// stops it (or until ALARM_MAX_MS passes), with the phone vibrating on the same beat. The tones are
// generated with the Web Audio API, so the app ships no audio files.

const BEEP_PATTERN = [0, 0.28, 0.56]; // beep starts, in seconds from the top of a cycle
const CYCLE_MS = 1700;
const ALARM_MAX_MS = 60_000;
const VIBRATE_PATTERN = [350, 180, 350, 180, 350];

export interface AlarmOptions {
  sound: boolean;
  vibrate: boolean;
  /** 0-1; the alarm is loud by design, so this only trims it. */
  volume?: number;
}

let ctx: AudioContext | null = null;
let cycleTimer: ReturnType<typeof setInterval> | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let ringing = false;

function playCycle(volume: number) {
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const start = ctx.currentTime;
  BEEP_PATTERN.forEach((offset, index) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "triangle";
    osc.frequency.value = index === BEEP_PATTERN.length - 1 ? 1175 : 880;
    osc.connect(gain);
    gain.connect(ctx!.destination);
    const at = start + offset;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.02, volume), at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.start(at);
    osc.stop(at + 0.25);
  });
}

function vibrateCycle() {
  try {
    navigator.vibrate?.(VIBRATE_PATTERN);
  } catch {
    // the device has no vibrator, or the page is not allowed to use it
  }
}

/** Starts ringing. Calling it again while it rings restarts the pattern. */
export function startAlarm({ sound, vibrate, volume = 0.35 }: AlarmOptions): void {
  stopAlarm();
  if (!sound && !vibrate) return;
  ringing = true;

  if (sound) {
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
    }
  }

  const tick = () => {
    if (sound) playCycle(volume);
    if (vibrate) vibrateCycle();
  };
  tick();
  cycleTimer = setInterval(tick, CYCLE_MS);
  stopTimer = setTimeout(stopAlarm, ALARM_MAX_MS);
}

/** Silences the alarm. Safe to call when nothing is ringing. */
export function stopAlarm(): void {
  if (cycleTimer) clearInterval(cycleTimer);
  if (stopTimer) clearTimeout(stopTimer);
  cycleTimer = null;
  stopTimer = null;
  ringing = false;
  try {
    navigator.vibrate?.(0);
  } catch {
    // no vibrator
  }
  if (ctx) {
    const closing = ctx;
    ctx = null;
    // Let the beeps already scheduled finish before the context goes away.
    setTimeout(() => void closing.close().catch(() => {}), 400);
  }
}

export function alarmRinging(): boolean {
  return ringing;
}
