"use client";

// ChemAI: small dialogs of the notebooks - rename, write instructions, confirm a delete.

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useL } from "@/mobile/i18n";
import { useOverlay } from "./useOverlay";
import { IRIS } from "./theme";

export function PromptDialog({
  title,
  initial,
  placeholder,
  multiline,
  max,
  confirmLabel,
  hint,
  onSave,
  onClose,
}: {
  title: string;
  initial: string;
  placeholder: string;
  multiline?: boolean;
  max: number;
  confirmLabel?: string;
  hint?: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const l = useL();
  const reduce = useReducedMotion();
  const [value, setValue] = useState(initial);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useOverlay(true, onClose);
  useEffect(() => {
    const id = window.setTimeout(() => field.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, []);
  const save = () => {
    if (!multiline && !value.trim()) return;
    onSave(value);
    onClose();
  };
  return (
    <div className="iris-ui fixed inset-0 z-[100] grid place-items-center bg-black/30 px-6" onClick={onClose} role="presentation">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[360px] rounded-[28px] bg-white p-5 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.4)]"
        initial={reduce ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 34 }}
      >
        <h2 className="text-[20px] font-medium text-[#0B0B0C]">{title}</h2>
        {hint && (
          <p className="mt-1 text-[14px] leading-5" style={{ color: IRIS.sub }}>
            {hint}
          </p>
        )}
        {multiline ? (
          <textarea
            ref={field}
            value={value}
            maxLength={max}
            rows={6}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            className="mt-3 block w-full resize-none rounded-2xl px-3.5 py-3 text-[16px] leading-[22px] text-[#0B0B0C] outline-none placeholder:text-[#9A989B]"
            style={{ background: IRIS.row }}
          />
        ) : (
          <input
            ref={field}
            value={value}
            maxLength={max}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
            }}
            placeholder={placeholder}
            className="iris-input-17 mt-3 block h-12 w-full rounded-2xl px-3.5 text-[17px] text-[#0B0B0C] outline-none placeholder:text-[#9A989B]"
            style={{ background: IRIS.row }}
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-full px-5 text-[16px] font-medium text-[#0B0B0C] active:bg-[#F2F0F1]">
            {l("Vazgeç", "Cancel")}
          </button>
          <button type="button" onClick={save} className="h-11 rounded-full bg-[#1F1F1F] px-5 text-[16px] font-medium text-white active:scale-[0.98]">
            {confirmLabel ?? l("Kaydet", "Save")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const l = useL();
  const reduce = useReducedMotion();
  useOverlay(true, onClose);
  return (
    <div className="iris-ui fixed inset-0 z-[100] grid place-items-center bg-black/30 px-6" onClick={onClose} role="presentation">
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[340px] rounded-[28px] bg-white p-5 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.4)]"
        initial={reduce ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 34 }}
      >
        <h2 className="text-[20px] font-medium text-[#0B0B0C]">{title}</h2>
        <p className="mt-2 text-[15px] leading-[21px]" style={{ color: IRIS.sub }}>
          {text}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-full px-5 text-[16px] font-medium text-[#0B0B0C] active:bg-[#F2F0F1]">
            {l("Vazgeç", "Cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="h-11 rounded-full bg-[#D7263D] px-5 text-[16px] font-medium text-white active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
