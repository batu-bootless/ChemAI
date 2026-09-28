"use client";

// Iris's natural voice straight from Azure: the website hands out a short-lived Speech token
// (/api/ai/speech-token, which keeps the key) and the phone asks Azure for each piece itself -
// no round trip through the website, so a sentence starts sounding about as soon as it is written.
// When there is no token (the website does not have the route, signed out, Azure refused), the
// website's /api/ai/tts voices the piece as before (naturalVoice.ts).

import { since, trace } from "./trace";

type Language = "tr" | "en";
type Gender = "male" | "female";

interface SpeechToken {
  token: string;
  region: string;
  voices: Record<Language, Record<Gender, string>>;
  standby: Record<Language, Record<Gender, string>>;
  /** On this phone's clock: the token is not used past this. */
  validUntil: number;
}

let current: SpeechToken | null = null;
let fetching: Promise<SpeechToken | null> | null = null;
/** No token until then (the route is missing, or refused): the website voices the pieces. */
let unavailableUntil = 0;

/** A token is renewed this long before it runs out, in the background while the old one still works. */
const RENEW_MS = 90_000;

function fetchToken(): Promise<SpeechToken | null> {
  fetching ??= (async () => {
    const started = performance.now();
    try {
      const res = await fetch("/api/ai/speech-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = (await res.json().catch(() => null)) as (Partial<SpeechToken> & { expiresIn?: number; error?: string }) | null;
      if (!res.ok || !json?.token || !json.region || !json.voices) {
        // Not on the website (404): leave it for the session's next half hour; anything else a minute.
        unavailableUntil = Date.now() + (res.status === 404 ? 30 * 60_000 : 60_000);
        trace("ses", `Azure izni alınamadı: ${res.status} ${json?.error ?? ""} (${since(started)})`);
        return null;
      }
      current = {
        token: json.token,
        region: json.region,
        voices: json.voices,
        standby: json.standby ?? json.voices,
        validUntil: Date.now() + Math.max(60_000, (json.expiresIn ?? 180_000) - 30_000),
      };
      trace("ses", `Azure izni alındı (${json.region}, ${since(started)})`);
      return current;
    } catch (error) {
      unavailableUntil = Date.now() + 30_000;
      trace("ses", `Azure izni alınamadı: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      fetching = null;
    }
  })();
  return fetching;
}

/** A usable token, fetching one if needed; null when the phone cannot talk to Azure itself now. */
export async function speechToken(): Promise<SpeechToken | null> {
  const now = Date.now();
  if (current && current.validUntil > now) {
    if (current.validUntil - now < RENEW_MS) void fetchToken();
    return current;
  }
  current = null;
  if (now < unavailableUntil) return null;
  return fetchToken();
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** The same SSML the website builds (src/lib/ai/tts.ts there): pause tags become breaks. */
function ssmlOf(text: string, voice: string, language: Language): string {
  const locale = language === "en" ? "en-US" : "tr-TR";
  const body = text
    .split(/(<(?:short|long) pause>)/)
    .map((part) => (part === "<short pause>" ? '<break time="300ms"/>' : part === "<long pause>" ? '<break time="700ms"/>' : escapeXml(part)))
    .join("");
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}"><voice name="${voice}">${body}</voice></speak>`;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function synthesize(token: SpeechToken, text: string, voice: string, language: Language): Promise<Response> {
  return fetch(`https://${encodeURIComponent(token.region)}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
    },
    body: ssmlOf(text, voice, language),
  });
}

/**
 * A piece voiced by Azure (base64 WAV, 24 kHz), or null when this way cannot give it right now -
 * then the website voices it. The HD voice gives way to the standard one when it refuses the piece.
 */
export async function azureSpeech(text: string, gender: Gender, language: Language): Promise<string | null> {
  let token = await speechToken();
  if (!token) return null;
  const started = performance.now();
  try {
    let res = await synthesize(token, text, token.voices[language][gender], language);
    if (res.status === 401 || res.status === 403) {
      // The token ran out early (or the resource changed): once more with a new one.
      current = null;
      token = await fetchToken();
      if (!token) return null;
      res = await synthesize(token, text, token.voices[language][gender], language);
    }
    if (res.status === 400) res = await synthesize(token, text, token.standby[language][gender], language);
    if (!res.ok) {
      trace("ses", `Azure ${res.status} (${since(started)}); site deneniyor`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 100) return null;
    trace("ses", `Azure doğrudan: ${text.length} karakter, ${since(started)}`);
    return toBase64(buffer);
  } catch (error) {
    trace("ses", `Azure'a ulaşılamadı: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
