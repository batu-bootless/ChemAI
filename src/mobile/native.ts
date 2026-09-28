// Chem+ Android app: the native side of the app (android/app/src/main/java/tr/com/chemplus/app/ChemPlusPlugin.java).
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** The live website. Its API routes hold the server-side keys (AI, PDF search, account deletion). */
export const WEBSITE_ORIGIN = "https://chemplus.com.tr";

/** Google's web OAuth client that Supabase's Google provider is configured with. */
export const GOOGLE_WEB_CLIENT_ID = "32969856313-u3k37b3g5v32hlk6uliuupf0to2ilsv9.apps.googleusercontent.com";

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface SavedFile {
  uri: string;
  /** Where the user finds the file, e.g. "İndirilenler/ChemAI/rapor.pdf". */
  location: string;
}

export interface ChemPlusPlugin {
  /** Runs a same-origin fetch to the live website's API from inside a browser engine (see ApiBridge.java). */
  apiRequest(options: {
    path: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    /** Hand the answer over as it arrives ("apiStream" events with `streamId`); the call resolves at its end. */
    stream?: boolean;
    streamId?: string;
  }): Promise<ApiResponse & { streamed?: boolean }>;
  /** Opens the website's page for API calls ahead of the first one (ApiBridge.java). */
  warmApi(): Promise<void>;
  /** Brings up the soft keyboard for the focused field (a page cannot, without a tap). */
  showKeyboard(): Promise<void>;
  saveFile(options: { fileName: string; mimeType: string; base64: string }): Promise<SavedFile>;
  openFile(options: { uri: string; mimeType: string }): Promise<void>;
  shareFile(options: { uri: string; mimeType: string; title?: string }): Promise<void>;
  printPage(options: { title?: string }): Promise<void>;
  printHtml(options: { html: string; title?: string }): Promise<void>;
  openExternal(options: { url: string }): Promise<void>;
  /** Android's "Sign in with Google" sheet (Credential Manager). */
  googleSignIn(options: { serverClientId: string; hashedNonce: string }): Promise<{ idToken: string }>;
  /** Iris's voice mode (Voice.java): Android's speech recognizer and text-to-speech. */
  speechAvailable(): Promise<{ recognition: boolean; permission: string }>;
  /** `silenceMs`: how long a pause ends the question. */
  startListening(options: { language: string; silenceMs?: number }): Promise<void>;
  stopListening(options: { cancel?: boolean }): Promise<void>;
  /**
   * Speaks sentence by sentence, each with its own rate, pitch and following silence (the voice
   * personality, src/lib/ai/personality.ts); a plain `text` is one sentence. Events carry `token`.
   * `bargeIn`: with headphones on, report the user talking over the answer ("bargeIn" event).
   */
  speak(options: {
    segments?: { text: string; rate: number; pitch: number; pauseMs: number }[];
    text?: string;
    language: string;
    rate?: number;
    pitch?: number;
    voice?: string;
    bargeIn?: boolean;
    token?: string;
  }): Promise<{ interrupted: boolean }>;
  /** The phone's voices for a language, most natural first (Google's network voices when online). */
  listVoices(options: { language: string }): Promise<{
    voices: { name: string; quality: number; network: boolean; locale: string }[];
    engine: string;
    online: boolean;
    best?: string;
  }>;
  stopSpeaking(): Promise<void>;
  /**
   * Plays a natural-voice clip (base64 WAV from the website's /api/ai/tts) through the same
   * pipeline as speak(): ttsStart / ttsLevel / ttsProgress / ttsDone / bargeIn events with `token`.
   * `speed` changes the pace, not the pitch.
   */
  playAudio(options: { audio: string; token?: string; bargeIn?: boolean; speed?: number }): Promise<{ interrupted: boolean }>;
  /** Keeps the screen on (voice mode). */
  keepAwake(options: { on: boolean }): Promise<void>;
  /** Android's haptic feedback, as the user's system settings allow. */
  haptic(options: { kind: "tick" | "confirm" | "reject" }): Promise<void>;
  /** Where sound goes: headphones (wired, USB, Bluetooth) or the phone's speaker. */
  audioRoute(): Promise<{ headphones: boolean }>;
  /** Text on a photo, read on the device with ML Kit. */
  recognizeText(options: { base64: string }): Promise<{ text: string; blocks: number }>;
  addListener(
    eventName:
      | "speechReady"
      | "speechBegin"
      | "speechPartial"
      | "speechFinal"
      | "speechLevel"
      | "speechEnd"
      | "speechError"
      | "ttsStart"
      | "ttsDone"
      | "ttsSegment"
      | "ttsRange"
      | "ttsLevel"
      | "ttsProgress"
      | "bargeIn"
      /** What the API bridge did (ApiBridge.java), for the diagnostic log. */
      | "apiTrace"
      /** A part of a streamed API answer: `stream`, `kind` head/chunk/end/error. */
      | "apiStream",
    listener: (data: {
      text?: string;
      level?: number;
      code?: string;
      interrupted?: boolean;
      token?: string;
      index?: number;
      start?: number;
      end?: number;
      /** ttsProgress: how much of the clip has been heard, 0…1. */
      fraction?: number;
      /** ttsLevel: the voice's shape (VoiceShape.java), which Iris's mouth follows. */
      bright?: number;
      f1?: number;
      f2?: number;
      stream?: string;
      kind?: "head" | "chunk" | "end" | "error";
      status?: number;
      headers?: Record<string, string>;
      message?: string;
    }) => void
  ): Promise<PluginListenerHandle>;
}

export const ChemPlus = registerPlugin<ChemPlusPlugin>("ChemPlus");

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** The keyboard for the field that has the focus: the app opens ready to type. */
export async function showKeyboard(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await ChemPlus.showKeyboard();
  } catch {
    // an older app without the method: the field keeps the focus, a tap brings the keyboard
  }
}

export async function openExternal(url: string): Promise<void> {
  if (isNativeApp()) await ChemPlus.openExternal({ url });
  else window.open(url, "_blank", "noopener");
}
