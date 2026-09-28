"use client";

// ChemAI: under an answer, what makes it trustworthy - the numbers checked against the engine
// (Kanıt denetimi) and the hazards and incompatible pairs found in a lab question (Güvenlik
// taraması). Both come from the app itself, not from the model.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { conflictReason, type SafetyScan } from "@/lib/ai/safetyScan";
import type { Verification } from "@/lib/ai/verify";
import { Pictogram } from "@/lib/safety/pictograms";
import { hazardText } from "@/lib/safety/statements";
import { STORAGE } from "@/lib/safety/chemicals";
import { ChevronRightIcon, VerifiedIcon, WarningIcon } from "@/mobile/iris/icons";
import { useL, useLocale } from "@/mobile/i18n";

function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? undefined : { height: 0, opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function VerificationRow({ verification }: { verification: Verification }) {
  const l = useL();
  const [open, setOpen] = useState(false);
  if (verification.mismatches.length) {
    return (
      <div className="rounded-[18px] bg-[#FFF4E5] px-3.5 py-2.5 text-[13.5px] leading-[19px] text-[#6B3A00]">
        <p className="flex items-center gap-1.5 font-semibold">
          <WarningIcon size={17} />
          {l("Kanıt denetimi: yanıtta hesapla uyuşmayan değer var", "Proof check: the answer disagrees with the engine")}
        </p>
        {verification.mismatches.slice(0, 3).map((item) => (
          <p key={item.text} className="mt-1">
            {l(
              `Yanıtta ${item.text} yazıyor; hesap motoru ${item.expected} buldu (${item.source}). Kartlardaki değer esas alınmalı.`,
              `The answer says ${item.text}; the engine found ${item.expected} (${item.source}). Go by the card.`
            )}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F5EC] py-1 pl-2 pr-2.5 text-[12.5px] font-semibold text-[#1E6B3A]"
      >
        <VerifiedIcon size={16} />
        {l(
          `Kanıt: ${verification.verified.length} değer hesap motoruyla doğrulandı`,
          `Proof: ${verification.verified.length} value${verification.verified.length === 1 ? "" : "s"} checked against the engine`
        )}
        <ChevronRightIcon size={14} strokeWidth={2.4} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      <Expand open={open}>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {verification.verified.map((item) => (
            <span key={item.text} className="rounded-full bg-white px-2.5 py-1 text-[12px] text-[#3A3A40] shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
              <span className="font-semibold text-[#0B0B0C]">{item.text}</span> · {item.source}
            </span>
          ))}
        </div>
        {verification.unchecked > 0 && (
          <p className="mt-1.5 text-[12px] text-[#6B696B]">
            {l(
              `${verification.unchecked} değer hesaplanmadı; genel bilgi ya da yaklaşık değer olabilir.`,
              `${verification.unchecked} value${verification.unchecked === 1 ? " was" : "s were"} not computed; general knowledge or approximate.`
            )}
          </p>
        )}
      </Expand>
    </div>
  );
}

export function SafetyRow({ scan }: { scan: SafetyScan }) {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      {scan.conflicts.map((conflict) => (
        <div key={`${conflict.a.id}-${conflict.b.id}`} className="rounded-[18px] bg-[#FDECEC] px-3.5 py-2.5 text-[13.5px] leading-[19px] text-[#7A1620]">
          <p className="flex items-center gap-1.5 font-semibold">
            <WarningIcon size={17} />
            {l("Güvenlik: uyumsuz kimyasallar", "Safety: incompatible chemicals")}
          </p>
          <p className="mt-1">
            {l(
              `${conflict.a.nameTr} ile ${conflict.b.nameTr} birlikte karıştırılmamalı ve yan yana saklanmamalı (${conflictReason(conflict, "tr")}).`,
              `${conflict.a.name} and ${conflict.b.name} must not be mixed or stored together (${conflictReason(conflict, "en")}).`
            )}
          </p>
          {(conflict.a.note || conflict.b.note) && <p className="mt-1 text-[12.5px] opacity-80">{(conflict.a.note ?? conflict.b.note)?.[language]}</p>}
        </div>
      ))}
      {scan.chemicals.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#FFF4E5] py-1 pl-2 pr-2.5 text-left text-[12.5px] font-semibold text-[#7A4300]"
          >
            <WarningIcon size={16} className="shrink-0" />
            <span className="truncate">
              {l("Güvenlik: ", "Safety: ")}
              {scan.chemicals.map((chemical) => (language === "tr" ? chemical.nameTr : chemical.name).replace(/\s*\(.*?\)/g, "")).join(", ")}
            </span>
            <ChevronRightIcon size={14} strokeWidth={2.4} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
          <Expand open={open}>
            <div className="mt-2 space-y-2">
              {scan.chemicals.map((chemical) => (
                <div key={chemical.id} className="rounded-[18px] bg-white px-3.5 py-2.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1">
                      {chemical.pictograms.map((id) => (
                        <Pictogram key={id} id={id} size={26} />
                      ))}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold text-[#0B0B0C]">{language === "tr" ? chemical.nameTr : chemical.name}</span>
                      <span className={`text-[12px] font-semibold ${chemical.signal === "danger" ? "text-[#C4271B]" : "text-[#A15C00]"}`}>
                        {chemical.signal === "danger" ? l("TEHLİKE", "DANGER") : l("DİKKAT", "WARNING")}
                      </span>
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-[12.5px] leading-[17px] text-[#3A3A40]">
                    {chemical.hazards.slice(0, 3).map((code) => (
                      <li key={code}>
                        <span className="font-semibold">{code}</span> {hazardText(code)?.[language] ?? ""}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[12px] text-[#6B696B]">{STORAGE[chemical.storage][language]}</p>
                </div>
              ))}
              <p className="text-[11.5px] text-[#6B696B]">
                {l("Uygulamanın güvenlik kartlarından; üreticinin güncel SDS'i esastır.", "From the app's safety cards; the supplier's current SDS governs.")}
              </p>
            </div>
          </Expand>
        </div>
      )}
    </div>
  );
}
