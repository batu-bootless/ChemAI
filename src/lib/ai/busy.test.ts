import { describe, expect, it } from "vitest";
import { AiBusyError, aiBusy, busyFrom, markBusy, retryDelay } from "./busy";

describe("busyFrom", () => {
  it("reads a 429 as busy, and a day's quota as daily", () => {
    expect(busyFrom(429, "Too many requests", null)).toEqual({ daily: false, retryAfterMs: null });
    expect(busyFrom(429, "Quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier", null)?.daily).toBe(true);
    expect(busyFrom(429, "İris'in günlük kotası doldu", null)?.daily).toBe(true);
  });

  it("takes the wait from Retry-After or from Gemini's words", () => {
    expect(busyFrom(429, "", "12")?.retryAfterMs).toBe(12_000);
    expect(busyFrom(429, "You exceeded your current quota. Please retry in 37.5s.", null)?.retryAfterMs).toBe(37_500);
    expect(busyFrom(500, '{"retryDelay": "8s"} RESOURCE_EXHAUSTED', null)?.retryAfterMs).toBe(8_000);
  });

  it("treats an overloaded model as busy, other failures not", () => {
    expect(busyFrom(503, "The model is overloaded", null)).not.toBeNull();
    expect(busyFrom(500, "Gemini: RESOURCE_EXHAUSTED", null)).not.toBeNull();
    expect(busyFrom(500, "İris yanıt veremedi.", null)).toBeNull();
    expect(busyFrom(401, "Giriş gerekli", null)).toBeNull();
    expect(busyFrom(400, "quota", null)).toBeNull();
  });
});

describe("retryDelay", () => {
  it("waits a few seconds, longer each time, as the AI asks", () => {
    const busy = new AiBusyError("", false, null);
    expect(retryDelay(busy, 0, 0)).toBe(6_000);
    expect(retryDelay(busy, 1, 0)).toBe(15_000);
    expect(retryDelay(new AiBusyError("", false, 500), 0, 0)).toBe(2_000);
    expect(retryDelay(new AiBusyError("", false, 20_000), 0, 1)).toBe(21_500);
  });

  it("does not wait out a used-up day or a long pause", () => {
    expect(retryDelay(new AiBusyError("", true, null), 0)).toBeNull();
    expect(retryDelay(new AiBusyError("", false, 60_000), 0)).toBeNull();
  });
});

describe("aiBusy", () => {
  it("saves calls for five minutes after a busy answer", () => {
    const now = 1_000_000;
    markBusy(now);
    expect(aiBusy(now + 60_000)).toBe(true);
    expect(aiBusy(now + 5 * 60_000 + 1)).toBe(false);
  });
});
