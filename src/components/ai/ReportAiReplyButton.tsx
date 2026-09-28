"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AI_REPORT_REASONS, reportAiReply, type AiReportReason } from "@/lib/ai/reportReply";
import { useL } from "@/mobile/i18n";

// The reasons are stored in Turkish (the review queue's language); English is only shown.
const REASON_EN: Record<AiReportReason, string> = {
  "Saldırgan veya uygunsuz içerik": "Offensive or inappropriate content",
  "Zararlı ya da tehlikeli yönlendirme": "Harmful or dangerous guidance",
  "Yanlış bilgi": "Incorrect information",
  "Diğer": "Other",
};

// Sits next to an AI reply (like CopyMessageButton): flags offensive or harmful output for review.
export default function ReportAiReplyButton({ text }: { text: string }) {
  const l = useL();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AiReportReason>(AI_REPORT_REASONS[0]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    const result = await reportAiReply(text, reason, note);
    setSubmitting(false);
    if (result.ok) {
      setDone(true);
      setNote("");
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={l("Yanıtı bildir", "Report reply")}
        aria-label={l("Yanıtı bildir", "Report reply")}
        className="grid size-7 shrink-0 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Flag className="size-3.5" />
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setDone(false);
            setError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{l("Yapay zekâ yanıtını bildir", "Report an AI reply")}</DialogTitle>
          </DialogHeader>
          {done ? (
            <p className="text-sm text-gray-600">
              {l(
                "Bildiriminiz alındı. Yanıt ekibimiz tarafından incelenecek. Teşekkür ederiz.",
                "Thanks, your report was received. Our team will review the reply."
              )}
            </p>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium text-gray-800">{l("Sorun nedir?", "What's wrong?")}</legend>
                {AI_REPORT_REASONS.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="ai-report-reason"
                      value={option}
                      checked={reason === option}
                      onChange={() => setReason(option)}
                    />
                    {l(option, REASON_EN[option])}
                  </label>
                ))}
              </fieldset>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={l("İsterseniz ayrıntı ekleyin", "Add details if you like")}
                maxLength={300}
                className="min-h-[80px]"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <DialogFooter>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {l("Bildir", "Report")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
