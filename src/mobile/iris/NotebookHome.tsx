"use client";

// ChemAI: the first view of a notebook (before a chat is opened): its name and way of working,
// its sources (what Iris answers from), the user's instructions, and the notebook's chats.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { prepareImage, readImageText } from "@/lib/ai/vision";
import { refreshHistory, useHistory } from "@/lib/ai/historyStore";
import { MAX_INSTRUCTIONS, MAX_SOURCES, MODE_INFO, addSource, notebookIdOf, removeSource, updateNotebook, type Notebook, type NotebookSource } from "@/lib/notebooks/store";
import { useL, useLocale } from "@/mobile/i18n";
import { FileIcon, InstructionsIcon, NotebookIcon, PasteIcon, PhotoIcon, PlusIcon, TrashIcon, UploadIcon } from "./icons";
import { PromptDialog } from "./NotebookDialogs";
import OverlayPage from "./OverlayPage";
import { useOverlay } from "./useOverlay";
import { shortDate } from "./PageHeader";
import { IRIS } from "./theme";

const TEXT_TYPES = ".txt,.md,.csv,.tsv,.json,.xml,.html,.htm,text/plain,text/markdown,text/csv,application/json";

function SourceIcon({ source }: { source: NotebookSource }) {
  if (source.kind === "photo" && source.thumb) {
    // eslint-disable-next-line @next/next/no-img-element -- a local preview
    return <img src={source.thumb} alt="" className="size-6 shrink-0 rounded-md object-cover" />;
  }
  return source.kind === "photo" ? <PhotoIcon size={20} /> : source.kind === "file" ? <FileIcon size={20} /> : <PasteIcon size={20} />;
}

/** The sheet of "+ Kaynak ekle": a file, a photo read on the device, or pasted text. */
function AddSourceSheet({ notebook, onClose }: { notebook: Notebook; onClose: () => void }) {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  useOverlay(!pasting, onClose);

  const done = (entry: ReturnType<typeof addSource>) => {
    if (!entry) setError(l(`En fazla ${MAX_SOURCES} kaynak eklenebilir.`, `At most ${MAX_SOURCES} sources.`));
    else onClose();
  };

  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(l("Dosya okunuyor…", "Reading the file…"));
    try {
      const text = (await file.text()).replace(/\u0000/g, "").trim();
      if (!text) throw new Error(l("Dosyada okunabilir metin yok.", "The file has no readable text."));
      done(addSource(notebook.id, { kind: "file", name: file.name, text }));
    } catch (e) {
      setError(e instanceof Error ? e.message : l("Dosya okunamadı.", "The file couldn't be read."));
    } finally {
      setBusy(null);
    }
  };

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(l("Fotoğraftaki metin cihazda okunuyor…", "Reading the photo's text on the device…"));
    try {
      const prepared = await prepareImage(file, language);
      const text = (await readImageText(prepared)).trim();
      if (!text) throw new Error(l("Fotoğrafta metin bulunamadı.", "No text found on the photo."));
      done(addSource(notebook.id, { kind: "photo", name: file.name.replace(/\.[a-z0-9]+$/i, "") || l("Fotoğraf", "Photo"), text, thumb: prepared.thumb }));
    } catch (e) {
      setError(e instanceof Error ? e.message : l("Fotoğraf okunamadı.", "The photo couldn't be read."));
    } finally {
      setBusy(null);
    }
  };

  const option = "flex w-full cursor-pointer items-center gap-[14px] px-5 py-[14px] text-left text-[17px] text-[#0B0B0C] active:bg-[#F4F4F6]";
  return (
    <>
      <motion.div className="fixed inset-0 z-[90] bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={l("Kaynak ekle", "Add a source")}
        className="iris-ui fixed inset-x-0 bottom-0 z-[91] rounded-t-[30px] pt-2"
        style={{ background: IRIS.sheet, paddingBottom: "calc(var(--app-safe-bottom) + 18px)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 420, damping: 40 }}
      >
        <div className="mx-auto h-[5px] w-9 rounded-full bg-[#C7C7CC]" aria-hidden="true" />
        <h2 className="px-5 pb-3 pt-4 text-[22px] text-[#0B0B0C]">{l("Kaynak ekle", "Add a source")}</h2>
        <p className="px-5 pb-3 text-[14px] leading-5" style={{ color: IRIS.sectionInk }}>
          {l(
            "İris bu not defterindeki yanıtlarını kaynaklarına dayandırır ve hangi kaynağı kullandığını [K1] gibi belirtir.",
            "Iris grounds its answers in this notebook's sources and marks which one it used, like [K1]."
          )}
        </p>
        <div className="mx-4 overflow-hidden rounded-[22px] bg-white">
          <label className={option}>
            <UploadIcon size={22} />
            <span className="min-w-0 flex-1">
              {l("Dosya yükle", "Upload a file")}
              <span className="block text-[13px]" style={{ color: IRIS.sectionInk }}>
                .txt · .md · .csv · .json
              </span>
            </span>
            <input type="file" accept={TEXT_TYPES} className="sr-only" disabled={busy !== null} onChange={(event) => { void fromFile(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          <div className="ml-[56px] h-px" style={{ background: IRIS.separator }} />
          <label className={option}>
            <PhotoIcon size={22} />
            <span className="min-w-0 flex-1">
              {l("Fotoğraf", "Photo")}
              <span className="block text-[13px]" style={{ color: IRIS.sectionInk }}>
                {l("Föy, etiket, tahta — metni cihazda okunur", "A handout, a label, a board — read on the device")}
              </span>
            </span>
            <input type="file" accept="image/*" className="sr-only" disabled={busy !== null} onChange={(event) => { void fromPhoto(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          <div className="ml-[56px] h-px" style={{ background: IRIS.separator }} />
          <button type="button" className={option} onClick={() => setPasting(true)} disabled={busy !== null}>
            <PasteIcon size={22} />
            <span className="min-w-0 flex-1">{l("Metin yapıştır", "Paste text")}</span>
          </button>
        </div>
        {busy && (
          <p className="mx-5 mt-3 flex items-center gap-2 text-[14px]" style={{ color: IRIS.sectionInk }}>
            <Loader2 className="size-4 animate-spin" /> {busy}
          </p>
        )}
        {error && <p className="mx-5 mt-3 text-[14px] text-[#D7263D]">{error}</p>}
      </motion.div>
      {pasting && (
        <PromptDialog
          title={l("Metin yapıştır", "Paste text")}
          initial=""
          multiline
          max={40_000}
          placeholder={l("Deney föyü, ölçümler, ders notu…", "A procedure, measurements, lecture notes…")}
          confirmLabel={l("Ekle", "Add")}
          onSave={(text) => {
            if (!text.trim()) return;
            const firstLine = text.trim().split("\n")[0].slice(0, 60);
            done(addSource(notebook.id, { kind: "text", name: firstLine || l("Metin", "Text"), text }));
          }}
          onClose={() => setPasting(false)}
        />
      )}
    </>
  );
}

export default function NotebookHome({ notebook, onOpenChat }: { notebook: Notebook; onOpenChat: (id: string) => void }) {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const history = useHistory();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<NotebookSource | null>(null);
  const [instructing, setInstructing] = useState(false);

  useEffect(() => {
    void refreshHistory();
  }, []);

  const chats = history.conversations.filter((conversation) => notebookIdOf(conversation.surface) === notebook.id);
  const mode = MODE_INFO[notebook.mode];

  return (
    <div className="pb-6">
      <NotebookIcon size={22} className="ml-[2px]" style={{ color: "#6F6D6F" }} />
      <h2 className="mt-3 text-[28px] leading-[34px] tracking-[-0.01em] text-[#0B0B0C]">{notebook.title}</h2>
      <p className="mt-1 text-[15px]" style={{ color: IRIS.sub }}>
        {language === "tr" ? mode.tr : mode.en}
      </p>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-[18px] font-medium text-[#0B0B0C]">{l("Kaynaklar", "Sources")}</h3>
        <button type="button" onClick={() => setAdding(true)} className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium text-[#0B0B0C]" style={{ background: IRIS.row }}>
          <PlusIcon size={18} /> {l("Ekle", "Add")}
        </button>
      </div>
      {notebook.sources.length === 0 ? (
        <p className="mt-2 text-[15px] leading-[21px]" style={{ color: IRIS.sub }}>
          {l(
            "Deney föyünü, ölçüm verini ya da ders notlarını ekle; İris yanıtlarını onlara dayandırır.",
            "Add your procedure, your measurements or lecture notes; Iris grounds its answers in them."
          )}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {notebook.sources.map((source, index) => (
            <button
              key={source.id}
              type="button"
              onClick={() => setViewing(source)}
              className="flex max-w-full items-center gap-2 rounded-full py-2 pl-3 pr-4 text-left text-[15px] text-[#0B0B0C]"
              style={{ background: IRIS.row }}
            >
              <SourceIcon source={source} />
              <span className="truncate">{source.name}</span>
              <span className="shrink-0 text-[13px]" style={{ color: IRIS.sub }}>
                K{index + 1}
              </span>
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setInstructing(true)} className="mt-6 flex w-full items-start gap-3 rounded-[20px] px-4 py-3.5 text-left" style={{ background: IRIS.row }}>
        <InstructionsIcon size={22} className="mt-px shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium text-[#0B0B0C]">{l("İris'e talimatlar", "Instructions for Iris")}</span>
          <span className="mt-0.5 line-clamp-2 block text-[14px] leading-5" style={{ color: IRIS.sub }}>
            {notebook.instructions.trim() || l("Bu not defterinde nasıl yanıt vereceğini söyle (ör. “yanıtları tablo halinde ver”).", "Tell Iris how to answer here (e.g. “answer with tables”).")}
          </span>
        </span>
      </button>

      {chats.length > 0 && (
        <>
          <h3 className="mt-7 text-[18px] font-medium text-[#0B0B0C]">{l("Sohbetler", "Chats")}</h3>
          <div className="-mx-4 mt-1">
            {chats.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onOpenChat(conversation.id)}
                className="flex h-[45px] w-full items-center gap-3 px-4 text-left active:bg-[#F2F0F1]"
              >
                <span className="min-w-0 flex-1 truncate text-[17px] text-[#0B0B0C]">{conversation.title || l("Adsız sohbet", "Untitled chat")}</span>
                <span className="shrink-0 text-[15px]" style={{ color: IRIS.sub }}>
                  {shortDate(conversation.updatedAt, language)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>{adding && <AddSourceSheet key="add" notebook={notebook} onClose={() => setAdding(false)} />}</AnimatePresence>
      <AnimatePresence>
        {viewing && (
          <OverlayPage
            key="source"
            title={viewing.name}
            onClose={() => setViewing(null)}
            menu={[
              {
                label: l("Kaynağı kaldır", "Remove the source"),
                icon: <TrashIcon size={20} />,
                danger: true,
                onSelect: () => {
                  removeSource(notebook.id, viewing.id);
                  setViewing(null);
                },
              },
            ]}
          >
            <div className="mx-4 mb-8 mt-2 rounded-[24px] bg-white px-5 py-4 shadow-[0_0_0_0.5px_rgb(0_0_0/0.05)]">
              {viewing.thumb && (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview
                <img src={viewing.thumb} alt="" className="mb-3 max-h-56 w-full rounded-2xl object-cover" />
              )}
              <p className="whitespace-pre-wrap text-[15px] leading-[22px] text-[#1F1F22]">{viewing.text}</p>
            </div>
          </OverlayPage>
        )}
      </AnimatePresence>
      {instructing && (
        <PromptDialog
          title={l("İris'e talimatlar", "Instructions for Iris")}
          hint={l("Bu not defterindeki her sohbette geçerli olur.", "Applies to every chat in this notebook.")}
          initial={notebook.instructions}
          multiline
          max={MAX_INSTRUCTIONS}
          placeholder={l("ör. Lisans düzeyinde anlat, sonuçları tabloyla ver, SI birimleri kullan.", "e.g. Explain at undergraduate level, give results as a table, use SI units.")}
          onSave={(instructions) => updateNotebook(notebook.id, { instructions: instructions.trim() })}
          onClose={() => setInstructing(false)}
        />
      )}
    </div>
  );
}
