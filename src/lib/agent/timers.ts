"use client";

// Chem+ app: the timers Iris starts from a conversation ("5 dakikalık zamanlayıcı kur").
//
// They live here rather than in a component, so a timer keeps running - and rings - whatever the
// screen: kept on the device, ticked by one clock for the whole app, ended with the Timer
// module's alarm (its sound and vibration settings) and, on the phone, with a notification booked
// for the end, so it arrives with the app in the background or closed too.

import { alarmRinging, startAlarm, stopAlarm } from "@/components/timer/alarm";
import { readTimerPrefs } from "@/components/timer/timerPrefs";
import { cancelNotification, notificationAccess, requestNotificationAccess, scheduleNotification } from "@/mobile/deviceNotifications";
import { textFor } from "@/mobile/i18n";

export type TimerState = "running" | "paused" | "done" | "cancelled";

export interface ChatTimer {
  id: string;
  label: string;
  /** The full length, in seconds. */
  seconds: number;
  /** While running: when it ends (ms since epoch). */
  endsAt: number | null;
  /** While paused: the seconds left. */
  left: number;
  state: TimerState;
  createdAt: number;
}

const KEY = "chemplus:agent-timers:v1";
/** A timer that ended longer ago than this (the app was closed) is marked done without ringing. */
const LATE_MS = 60_000;

let timers: ChatTimer[] | null = null;
const listeners = new Set<() => void>();
let clock: number | null = null;
let ringingId: string | null = null;

function all(): ChatTimer[] {
  if (timers) return timers;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    timers = Array.isArray(parsed) ? (parsed as ChatTimer[]) : [];
  } catch {
    timers = [];
  }
  return timers;
}

function changed(): void {
  try {
    // The last thirty are enough to show on old conversations.
    window.localStorage.setItem(KEY, JSON.stringify(all().slice(-30)));
  } catch {
    // storage unavailable: the timer still runs until the app closes
  }
  for (const listener of listeners) listener();
}

/** A stable notification id per timer (the Timer module uses 1001-1003). */
function notificationId(id: string): number {
  let hash = 7;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 2000 + (hash % 900);
}

export function timerLeft(timer: ChatTimer, now = Date.now()): number {
  if (timer.state === "running" && timer.endsAt) return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  if (timer.state === "paused") return timer.left;
  return 0;
}

function ring(timer: ChatTimer): void {
  const prefs = readTimerPrefs();
  ringingId = timer.id;
  startAlarm({ sound: prefs.sound, vibrate: prefs.vibrate, volume: prefs.volume });
}

function tick(): void {
  const now = Date.now();
  let any = false;
  for (const timer of all()) {
    if (timer.state !== "running" || !timer.endsAt) continue;
    if (timer.endsAt > now) continue;
    const late = now - timer.endsAt > LATE_MS;
    timer.state = "done";
    timer.left = 0;
    timer.endsAt = null;
    any = true;
    if (!late) ring(timer);
  }
  if (any) changed();
  if (!all().some((timer) => timer.state === "running")) stopClock();
}

function startClock(): void {
  if (clock !== null || typeof window === "undefined") return;
  clock = window.setInterval(tick, 500);
  // A phone stops the page's timers in the background: the clock is read again on return.
  document.addEventListener("visibilitychange", tick);
}

function stopClock(): void {
  if (clock === null) return;
  window.clearInterval(clock);
  clock = null;
  document.removeEventListener("visibilitychange", tick);
}

let started = false;
/** Picks up timers that were running when the app last closed. */
function ensureStarted(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  if (all().some((timer) => timer.state === "running")) {
    tick();
    startClock();
  }
}

async function book(timer: ChatTimer): Promise<void> {
  if (!timer.endsAt || !readTimerPrefs().notify) return;
  try {
    if ((await notificationAccess()) === "prompt") await requestNotificationAccess();
    await scheduleNotification({
      id: notificationId(timer.id),
      title: textFor("Süre doldu", "Time's up"),
      body: timer.label,
      at: new Date(timer.endsAt),
    });
  } catch {
    // no notification: the in-app alarm still rings
  }
}

function unbook(timer: ChatTimer): void {
  void cancelNotification(notificationId(timer.id));
}

export function createTimer(seconds: number, label: string): ChatTimer {
  ensureStarted();
  const now = Date.now();
  const timer: ChatTimer = {
    id: `timer-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    seconds,
    endsAt: now + seconds * 1000,
    left: seconds,
    state: "running",
    createdAt: now,
  };
  all().push(timer);
  changed();
  void book(timer);
  startClock();
  return timer;
}

export function getTimer(id: string): ChatTimer | null {
  ensureStarted();
  return all().find((timer) => timer.id === id) ?? null;
}

function update(id: string, change: (timer: ChatTimer) => void): void {
  const timer = all().find((item) => item.id === id);
  if (!timer) return;
  change(timer);
  changed();
}

export function pauseTimer(id: string): void {
  update(id, (timer) => {
    if (timer.state !== "running") return;
    timer.left = timerLeft(timer);
    timer.endsAt = null;
    timer.state = "paused";
    unbook(timer);
  });
}

export function resumeTimer(id: string): void {
  update(id, (timer) => {
    if (timer.state !== "paused") return;
    timer.endsAt = Date.now() + timer.left * 1000;
    timer.state = "running";
    void book(timer);
  });
  startClock();
}

/** Starts the same timer again from its full length. */
export function restartTimer(id: string): void {
  if (ringingId === id) silenceTimers();
  update(id, (timer) => {
    unbook(timer);
    timer.endsAt = Date.now() + timer.seconds * 1000;
    timer.left = timer.seconds;
    timer.state = "running";
    void book(timer);
  });
  startClock();
}

export function cancelTimer(id: string): void {
  if (ringingId === id) silenceTimers();
  update(id, (timer) => {
    unbook(timer);
    timer.endsAt = null;
    timer.left = 0;
    timer.state = "cancelled";
  });
}

export function silenceTimers(): void {
  stopAlarm();
  ringingId = null;
  for (const listener of listeners) listener();
}

/** Whether this timer's alarm is ringing now. */
export function timerRinging(id: string): boolean {
  return ringingId === id && alarmRinging();
}

export function onTimers(listener: () => void): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
