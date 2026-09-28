"use client";

// Before the first question: the way to the website opened (the bridge's hidden page and the
// website's check), the answer's server function woken, and - for voice mode - Azure's token
// fetched. A cold start of any of them is seconds the user would otherwise wait on a question.

import { warmApi } from "@/mobile/bridges";
import { speechToken } from "./azureVoice";
import { warmChat } from "./client";

let lastWarm = 0;
/** A server function stays awake for some minutes; waking it more often buys nothing. */
const AWAKE_MS = 4 * 60_000;

export function warmAi(options: { voice?: boolean } = {}): void {
  if (options.voice) void speechToken();
  const now = Date.now();
  if (now - lastWarm < AWAKE_MS) return;
  lastWarm = now;
  warmApi();
  warmChat();
}
