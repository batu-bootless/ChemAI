"use client";

// ChemAI: "Yeni not defteri", laid out as the Gemini app's new-notebook screen (the user's
// reference screenshot): "Ne üzerinde çalışmak istiyorsunuz?", a large field for the name, the
// ways of working as cards (the chosen one opens with its description and a ✓), and "Not defteri
// oluştur". The notebook opens straight away as its own chat.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { createNotebook, type NotebookMode } from "@/lib/notebooks/store";
import { useL } from "@/mobile/i18n";
import { CheckIcon, FlaskIcon, LightbulbIcon, NotebookIcon, SchoolIcon } from "./icons";
import PageHeader from "./PageHeader";
import { IRIS } from "./theme";

export const MODE_CARDS: { mode: NotebookMode; icon: typeof LightbulbIcon; tr: string; en: string; textTr: string; textEn: string }[] = [
  {
    mode: "organize",
    icon: LightbulbIcon,
    tr: "Fikirlerinizi organize edin",
    en: "Organize your ideas",
    textTr: "Sohbetleri konuya göre gruplandırın ve kendi kaynaklarınızı yükleyin.",
    textEn: "Group chats by topic and upload your own sources.",
  },
  {
    mode: "study",
    icon: SchoolIcon,
    tr: "Çalışın ve öğrenin",
    en: "Study and learn",
    textTr: "İris konuyu adım adım öğretir, sorularla pekiştirir ve sizi test eder.",
    textEn: "Iris teaches step by step, checks with questions and quizzes you.",
  },
  {
    mode: "lab",
    icon: FlaskIcon,
    tr: "Deney planlayın",
    en: "Plan an experiment",
    textTr: "Hesaplar, protokol ve güvenlik kontrolleri tek yerde; İris deneyi sizinle kurar.",
    textEn: "Calculations, protocol and safety checks in one place; Iris sets it up with you.",
  },
];

export default function NewNotebookScreen() {
  const l = useL();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<NotebookMode>("organize");
  const input = useRef<HTMLInputElement>(null);
  const ready = title.trim().length > 0;

  useEffect(() => {
    const id = window.setTimeout(() => input.current?.focus(), 150);
    return () => window.clearTimeout(id);
  }, []);

  const create = () => {
    if (!ready) return;
    const notebook = createNotebook(title, mode);
    router.replace(`/dashboard/notebook/?id=${notebook.id}`);
  };

  return (
    <main className="iris-ui flex min-h-[var(--app-content-h)] flex-col" style={{ background: IRIS.bg }}>
      <PageHeader />
      <div className="px-4">
        <NotebookIcon size={22} className="ml-[2px] mt-[20px]" style={{ color: "#6F6D6F" }} />
        <p className="mt-[17px] text-[17px] leading-[22px] text-[#0B0B0C]">{l("Ne üzerinde çalışmak istiyorsunuz?", "What do you want to work on?")}</p>
        <input
          ref={input}
          value={title}
          maxLength={90}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create();
          }}
          placeholder={l("Proje veya fikir", "Project or idea")}
          enterKeyHint="done"
          aria-label={l("Not defterinin adı", "Notebook name")}
          className="iris-input-32 mt-[11px] block h-10 w-full bg-transparent text-[32px] leading-10 tracking-[-0.01em] text-[#0B0B0C] outline-none placeholder:text-[#BCBABB]"
          style={{ caretColor: IRIS.caret }}
        />
      </div>

      <div className="mx-4 mt-[31px] flex gap-[7px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label={l("Çalışma şekli", "Way of working")}>
        {MODE_CARDS.map((card) => {
          const selected = card.mode === mode;
          const Icon = card.icon;
          return (
            <motion.button
              key={card.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(card.mode)}
              layout
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
              className="relative flex h-[120px] shrink-0 flex-col items-start justify-start overflow-hidden rounded-[22px] pl-[14px] pr-3 pt-[12px] text-left"
              style={{ width: selected ? 239 : 132, background: selected ? IRIS.selected : IRIS.row }}
            >
              <Icon size={22} className="text-[#0B0B0C]" />
              {selected && (
                <span className="absolute right-[9px] top-[9px] grid size-[30px] place-items-center rounded-full bg-white text-[#0B0B0C]">
                  <CheckIcon size={16} strokeWidth={1.9} />
                </span>
              )}
              <span className={`mt-[3px] block w-full text-[17px] font-medium leading-[20px] tracking-[-0.01em] text-[#0B0B0C] ${selected ? "truncate" : "line-clamp-3"}`}>
                {l(card.tr, card.en)}
              </span>
              {selected && (
                <span className="mt-[2px] line-clamp-3 block text-[15px] leading-[17.5px]" style={{ color: IRIS.sub }}>
                  {l(card.textTr, card.textEn)}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <div className="px-4">
        <button
          type="button"
          onClick={create}
          disabled={!ready}
          className="mt-[51px] h-[60px] w-full rounded-full text-[17px] font-medium transition-colors"
          style={{ background: ready ? "#1F1F1F" : IRIS.disabledBg, color: ready ? "#fff" : IRIS.disabledInk }}
        >
          {l("Not defteri oluştur", "Create notebook")}
        </button>
      </div>
    </main>
  );
}
