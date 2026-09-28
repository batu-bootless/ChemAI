// Chem+ app: the notifications the app raises on the phone itself (timer alarms today).
//
// In the Android app these go through @capacitor/local-notifications, so one scheduled at a
// deadline still arrives when the app is in the background or closed. In a browser the same calls
// fall back to the Web Notification API, which only fires while the tab is open.
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeApp } from "./native";

export type NotificationAccess = "granted" | "denied" | "prompt" | "unsupported";

/** Notification ids the app uses, so a stale one can always be cancelled by name. */
export const NOTIFICATION_IDS = {
  countdown: 1001,
  session: 1002,
  /** A protocol step that is timing itself, so the phone can say when the wait is over. */
  protocol: 1003,
} as const;

function webNotificationsAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.Notification !== "undefined";
}

function fromWebPermission(permission: NotificationPermission): NotificationAccess {
  return permission === "granted" ? "granted" : permission === "denied" ? "denied" : "prompt";
}

/** Whether the phone (or browser) can show notifications at all. */
export function notificationsSupported(): boolean {
  return isNativeApp() || webNotificationsAvailable();
}

export async function notificationAccess(): Promise<NotificationAccess> {
  try {
    if (isNativeApp()) {
      const status = await LocalNotifications.checkPermissions();
      return status.display === "prompt-with-rationale" ? "prompt" : status.display;
    }
  } catch {
    return "unsupported";
  }
  if (!webNotificationsAvailable()) return "unsupported";
  return fromWebPermission(window.Notification.permission);
}

/** Asks for permission if it has not been answered yet; returns where things stand afterwards. */
export async function requestNotificationAccess(): Promise<NotificationAccess> {
  try {
    if (isNativeApp()) {
      const status = await LocalNotifications.requestPermissions();
      return status.display === "prompt-with-rationale" ? "prompt" : status.display;
    }
  } catch {
    return "unsupported";
  }
  if (!webNotificationsAvailable()) return "unsupported";
  if (window.Notification.permission === "default") {
    return fromWebPermission(await window.Notification.requestPermission());
  }
  return fromWebPermission(window.Notification.permission);
}

interface NotificationContent {
  id: number;
  title: string;
  body: string;
}

/**
 * Books a notification for a moment in the future. Native only: a browser tab cannot be woken up,
 * so there the caller's own timer shows it when the moment arrives.
 */
export async function scheduleNotification({ id, title, body, at }: NotificationContent & { at: Date }): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    if ((await notificationAccess()) !== "granted") return false;
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          schedule: { at, allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch (error) {
    console.error("Bildirim planlanamadı", error);
    return false;
  }
}

/** Drops a booked notification (the timer was paused, reset or finished early). */
export async function cancelNotification(id: number): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    // nothing was booked
  }
}

/** Shows a notification right now. */
export async function notifyNow({ id, title, body }: NotificationContent): Promise<void> {
  try {
    if (isNativeApp()) {
      if ((await notificationAccess()) !== "granted") return;
      await LocalNotifications.schedule({ notifications: [{ id, title, body }] });
      return;
    }
    if (webNotificationsAvailable() && window.Notification.permission === "granted") {
      new window.Notification(title, { body });
    }
  } catch (error) {
    console.error("Bildirim gösterilemedi", error);
  }
}
