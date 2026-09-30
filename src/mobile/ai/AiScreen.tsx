"use client";

// ChemAI: Iris, the app's AI and its main screen, full screen.
//
// A chat laid out like Gemini's - a white page, the ChemPlus logo and one question in the middle,
// a blue light swelling up from the bottom (WaveGlow: calm while it waits, quicker while Iris
// answers, gone once the answer is in), and liquid glass that bends what is behind it for the
// buttons, the shortcuts and the one input bar floating at the bottom - with three ways in - type,
// photograph, talk - and one way
// every answer is built: the question goes through the calculation engine first (RDKit and the
// app's own solvers, on the device), and the AI writes its answer around results it did not have
// to guess. The cards those results produce sit above each answer; the pipeline's progress sits in
// the thinking bubble (understand → compute → answer), so the user sees which part is proof.

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUp,
  AudioLines,
  Calculator,
  Camera,
  Expand,
  FileSpreadsheet,
  FileText,
  Files,
  Hexagon,
  ImagePlus,
  Loader2,
  Mic,
  NotebookPen,
  Plus,
  RotateCcw,
  ScanText,
  Timer,
  X,
} from "lucide-react";
import ImageViewer from "@/components/ai/ImageViewer";
import { useAiConversation } from "@/components/ai/useAiConversation";
import { prepareImage, readImageText, imageNote, type PreparedImage } from "@/lib/ai/vision";
import { readImageWithAi, type VisionReading } from "@/lib/ai/visionAi";
import { readDataFile, type ReadDataFile } from "@/lib/ai/datafile";
import type { Phase } from "@/lib/ai/assistant";
import { FILE_ACCEPT, countLabel, isDataTable, isImageFile, kindLabel, readFileDoc, type FileDoc } from "@/lib/files/read";
import { saveDoc } from "@/lib/files/store";
import { readIrisPrefs, useIrisPrefs } from "@/lib/ai/irisPrefs";
import { unlockAudio } from "@/lib/ai/naturalVoice";
import { listen, speak, stopSpeaking, type Listening } from "@/lib/ai/voice";
import { warmAi } from "@/lib/ai/warm";
import { deleteNotebook, updateNotebook, useNotebook, type NotebookMode } from "@/lib/notebooks/store";
import { useL, useLocale } from "@/mobile/i18n";
import Wordmark from "@/mobile/brand/Wordmark";
import CircleButton from "@/mobile/iris/CircleButton";
import { useIrisShell, useMenuSwipe, usePageHandlers } from "@/mobile/iris/IrisShell";
import { showKeyboard } from "@/mobile/native";
import { MenuIcon, MoreIcon, NewChatIcon, NotebookIcon, PencilIcon, PinIcon, TrashIcon } from "@/mobile/iris/icons";
import { ConfirmDialog, PromptDialog } from "@/mobile/iris/NotebookDialogs";
import NotebookHome from "@/mobile/iris/NotebookHome";
import { GlassMenu } from "@/mobile/iris/OverlayPage";
import { useLiquidGlass } from "@/mobile/ui/liquidGlass";
import AssistantMessage, { AiAvatar } from "./AssistantMessage";
import VoiceMode, { type Ask } from "./VoiceMode";
import WaveGlow from "./WaveGlow";

type Attachment =
  | {
      kind: "image";
      image: PreparedImage | null;
      thumb: string;
      status: "preparing" | "reading" | "ready" | "failed";
      text: string;
      error?: string;
      /** The vision model's reading (visionAi.ts), when it was asked and answered. */
      reading?: VisionReading | null;
      /** The photo is being sent to the vision model (the setting is on). */
      vision?: boolean;
    }
  | { kind: "data"; file: ReadDataFile }
  | { kind: "file"; name: string; status: "reading" | "ready"; progress?: { done: number; total: number; what: "pages" | "scan" }; doc?: FileDoc };

/** The keyboard comes up by itself once per app start, not every time the chat opens. */
const launch = { keyboardShown: false };

export default function AiScreen({ notebookId = null }: { notebookId?: string | null }) {
  const l = useL();
  const locale = useLocale();
  const language = locale.startsWith("en") ? "en" : "tr";
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const shell = useIrisShell();
  const notebook = useNotebook(notebookId);
  // The chat on screen is in the address (?c=…), so the back button and the menu find it again.
  const syncAddress = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    url.searchParams.delete("q");
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  };
  const ai = useAiConversation({ surface: "", notebookId, onConversation: syncAddress });
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [notebookMenu, setNotebookMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useRef<Listening | null>(null);
  const askRef = useRef<Ask | null>(null);
  const prepareRef = useRef<((text: string) => void) | null>(null);
  const seeded = useRef(false);
  const composerBoxRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  // The composer floats over the chat: the end of the chat stays clear of it, however tall it is.
  const [composerHeight, setComposerHeight] = useState(140);
  useEffect(() => {
    const box = composerBoxRef.current;
    if (!box) return;
    const update = () => setComposerHeight(box.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  // "Read answers aloud" (Settings → Ses): every new answer is spoken as it arrives.
  const { autoSpeak } = useIrisPrefs();
  const autoSpeakRef = useRef(autoSpeak);
  autoSpeakRef.current = autoSpeak;

  // Sliding the chat to the right opens the menu.
  useMenuSwipe();

  // The app opens ready to type, as ChatGPT does: the keyboard is up on the first empty chat.
  useEffect(() => {
    if (launch.keyboardShown) return;
    launch.keyboardShown = true;
    if (notebookId || params.get("c") || params.get("q") || params.get("voice") === "1") return;
    const id = window.setTimeout(() => {
      composerRef.current?.focus({ preventScroll: true });
      void showKeyboard();
    }, 350);
    return () => window.clearTimeout(id);
    // Once, when the app starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shortScreen = useShortViewport();

  // The menu's "new chat" and its recent chats act on this screen directly.
  usePageHandlers({
    newChat: () => {
      stopSpeaking();
      setSpeakingId(null);
      setAttachment(null);
      ai.startNewChat();
    },
    openConversation: (id) => void ai.openConversation(id),
    activeConversation: ai.activeId,
  });

  const speakReply = async (reply: string, turnId: string) => {
    if (!autoSpeakRef.current) return;
    setSpeakingId(turnId);
    try {
      await speak(reply, language);
    } catch {
      // no voice for this language: the answer is on screen
    } finally {
      setSpeakingId((current) => (current === turnId ? null : current));
    }
  };

  // Voice mode always sends through the conversation as it is now, not as it was when it opened.
  useEffect(() => {
    askRef.current = ai.send;
    prepareRef.current = ai.prepare;
  });

  // The way to Iris is opened as soon as its screen is: the first question does not wait for it.
  useEffect(() => {
    warmAi();
  }, []);

  // Follow the conversation down; the welcome screen stays at its top. While an answer is being
  // written it is followed only by someone reading at the bottom, not pulled from further up.
  const hasTurns = ai.messages.length > 0 || ai.loading;
  const turnCount = useRef(0);
  useEffect(() => {
    const box = scrollRef.current;
    if (!hasTurns || !box) return;
    const grew = ai.messages.length !== turnCount.current;
    turnCount.current = ai.messages.length;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 220;
    if (!grew && !atBottom) return;
    box.scrollTo({ top: box.scrollHeight, behavior: reduce || !grew ? "auto" : "smooth" });
  }, [ai.messages, ai.loading, hasTurns, reduce]);

  // ?c=… reopens a chat (the menu, the search, the back button); ?q=… is asked once (Help, the
  // Library's "ask Iris"); ?voice=1 opens voice mode.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const conversation = params.get("c");
    const question = params.get("q");
    const voice = params.get("voice") === "1";
    const id = window.setTimeout(() => {
      if (conversation) void ai.openConversation(conversation);
      else if (question) ai.send(question, { fresh: true, onReply: speakReply });
      if (voice) setVoiceOpen(true);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      dictation.current?.cancel();
      stopSpeaking();
    },
    []
  );

  const submit = (text: string) => {
    const ready =
      !attachment || attachment.kind === "data" || (attachment.kind === "file" ? attachment.status === "ready" : attachment.status === "ready" || attachment.status === "failed");
    if (!ready) return;
    const image =
      attachment?.kind === "image" && attachment.image
        ? {
            thumb: attachment.thumb,
            // The 1600 px copy, for the full-screen viewer (kept in memory for this chat only).
            full: `data:image/jpeg;base64,${attachment.image.base64}`,
            note: imageNote(attachment.text, attachment.image.color, attachment.reading),
          }
        : undefined;
    const data = attachment?.kind === "data" ? { name: attachment.file.name, csv: attachment.file.csv } : undefined;
    const file = attachment?.kind === "file" ? attachment.doc : undefined;
    stopSpeaking();
    setSpeakingId(null);
    // The send tap is when a browser lets the answer be read aloud later.
    if (autoSpeakRef.current) unlockAudio();
    if (ai.send(text, { image, data, file, onReply: speakReply })) {
      setInput("");
      setAttachment(null);
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const temporary = URL.createObjectURL(file);
    setAttachment({ kind: "image", image: null, thumb: temporary, status: "preparing", text: "" });
    try {
      const prepared = await prepareImage(file, language);
      URL.revokeObjectURL(temporary);
      // The phone's own text reading and, when allowed, the vision model's, side by side: the
      // vision model can read drawn structures and schemes; the phone's reading is the fallback.
      const vision = readIrisPrefs().visionModel;
      setAttachment({ kind: "image", image: prepared, thumb: prepared.thumb, status: "reading", text: "", vision });
      const [ocr, reading] = await Promise.all([
        readImageText(prepared).then(
          (text) => ({ text, error: undefined as string | undefined }),
          (error: unknown) => ({ text: "", error: error instanceof Error ? error.message : undefined })
        ),
        vision ? readImageWithAi(prepared.base64, language) : Promise.resolve(null),
      ]);
      setAttachment((current) =>
        current?.kind === "image" && current.thumb === prepared.thumb
          ? reading || !ocr.error
            ? { ...current, status: "ready", text: ocr.text, reading }
            : { ...current, status: "failed", error: ocr.error }
          : current
      );
    } catch {
      setAttachment(null);
    }
  };

  const [fileError, setFileError] = useState<string | null>(null);
  const pickData = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      setAttachment({ kind: "data", file: await readDataFile(file) });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : l("Dosya okunamadı.", "The file couldn't be read."));
    }
  };

  // "Dosyalar": a PDF, a Word, PowerPoint or Excel file or a text file is read on the phone for
  // Iris to search and answer from; a photo goes the photo way, a CSV table the data way.
  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (isImageFile(file)) return pickImage(file);
    if (isDataTable(file)) return pickData(file);
    const name = file.name;
    setAttachment({ kind: "file", name, status: "reading" });
    try {
      const doc = await readFileDoc(file, (done, total, what) =>
        setAttachment((current) => (current?.kind === "file" && current.name === name && current.status === "reading" ? { ...current, progress: { done, total, what } } : current))
      );
      await saveDoc(doc);
      setAttachment((current) => (current?.kind === "file" && current.name === name ? { kind: "file", name, status: "ready", doc } : current));
    } catch (error) {
      setAttachment((current) => (current?.kind === "file" && current.name === name ? null : current));
      setFileError(error instanceof Error ? error.message : l("Dosya okunamadı.", "The file couldn't be read."));
    }
  };

  const toggleDictation = async () => {
    if (dictating) {
      dictation.current?.finish();
      return;
    }
    const before = input.trim();
    setDictating(true);
    dictation.current = await listen(language, {
      onPartial: (text) => setInput(before ? `${before} ${text}` : text),
      onFinal: (text) => {
        setInput(before ? `${before} ${text}` : text);
        setDictating(false);
        dictation.current = null;
      },
      onError: () => {
        setDictating(false);
        dictation.current = null;
      },
    });
  };

  const hasText = input.trim().length > 0 || attachment !== null;
  const lastQuestion = [...ai.messages].reverse().find((turn) => turn.role === "user");
  const preparing =
    (attachment?.kind === "image" && (attachment.status === "preparing" || attachment.status === "reading")) || (attachment?.kind === "file" && attachment.status === "reading");
  const [focused, setFocused] = useState(false);
  const chatting = ai.messages.length > 0 || ai.loading;
  const welcome = !ai.opening && !chatting;
  // Iris's light: up while the chat is empty and while an answer is on its way, then gone.
  const answering = ai.loading || ai.messages.some((turn) => turn.pending);
  const glow = !ai.opening && (welcome || answering);

  return (
    <main className="app-light iris-ui relative flex h-[var(--app-content-h,100dvh)] flex-col overflow-hidden bg-[#FAF8F9]">
      <AnimatePresence>
        {/* Wider and deeper than the screen: the blur fades the canvas's own edges, which stay hidden. */}
        {glow && (
          <motion.div
            key="glow"
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-8 -bottom-8 h-[calc(56%+2rem)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 1.2, ease: "easeInOut" }}
          >
            <WaveGlow active={answering} still={Boolean(reduce)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header, as the Gemini app's: ☰ on the left; a new chat (and in a notebook its menu) on the right. */}
      <header className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-[#FAF8F9] via-[#FAF8F9]/85 to-transparent px-[15px] pb-5 pt-[8px]">
        <div className="relative mx-auto flex w-full max-w-2xl items-center gap-2">
          <CircleButton label={l("Menü", "Menu")} onClick={shell.openDrawer}>
            <MenuIcon size={24} />
          </CircleButton>
          {notebook && !welcome && (
            <p className="pointer-events-none absolute inset-x-[110px] truncate text-center text-[17px] font-medium text-[#0B0B0C]">{notebook.title}</p>
          )}
          <span className="flex-1" />
          <CircleButton
            label={l("Yeni sohbet", "New chat")}
            onClick={() => {
              stopSpeaking();
              setSpeakingId(null);
              setAttachment(null);
              ai.startNewChat();
            }}
          >
            <NewChatIcon size={24} />
          </CircleButton>
          {notebook && (
            <div className="relative">
              <CircleButton label={l("Not defteri menüsü", "Notebook menu")} onClick={() => setNotebookMenu((value) => !value)} active={notebookMenu}>
                <MoreIcon size={24} />
              </CircleButton>
              <AnimatePresence>
                {notebookMenu && (
                  <GlassMenu
                    onClose={() => setNotebookMenu(false)}
                    items={[
                      { label: l("Not defterine git", "Notebook home"), icon: <NotebookIcon size={20} />, onSelect: () => ai.startNewChat() },
                      {
                        label: notebook.pinned ? l("Sabitlemeyi kaldır", "Unpin") : l("Sabitle", "Pin"),
                        icon: <PinIcon size={20} />,
                        onSelect: () => updateNotebook(notebook.id, { pinned: !notebook.pinned }, false),
                      },
                      { label: l("Yeniden adlandır", "Rename"), icon: <PencilIcon size={20} />, onSelect: () => setRenaming(true) },
                      { label: l("Sil", "Delete"), icon: <TrashIcon size={20} />, danger: true, onSelect: () => setDeleting(true) },
                    ]}
                  />
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </header>
      {ai.temporary && !welcome && (
        <p className="pointer-events-none absolute inset-x-0 top-[62px] z-20 text-center text-[12.5px] font-medium text-[#6B696B]">
          {l("Geçici sohbet · kaydedilmiyor", "Temporary chat · not saved")}
        </p>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
        style={{ paddingTop: 68, paddingBottom: composerHeight + 12 }}
      >
        <div className={`mx-auto w-full max-w-2xl space-y-6 ${welcome && !notebookId ? "flex min-h-full flex-col justify-center" : ""}`}>
          {ai.opening ? (
            <div className="grid place-items-center py-20">
              <Loader2 className="size-6 animate-spin text-[#8E8E98]" />
            </div>
          ) : welcome && notebookId ? (
            notebook ? (
              <NotebookHome notebook={notebook} onOpenChat={(id) => void ai.openConversation(id)} />
            ) : (
              <div className="pt-10 text-center">
                <p className="text-[17px] text-[#0B0B0C]">{l("Bu not defteri bu cihazda yok.", "This notebook isn't on this device.")}</p>
                <button type="button" onClick={() => router.push("/dashboard/notebooks/")} className="mt-4 h-11 rounded-full bg-[#1F1F1F] px-5 text-[16px] font-medium text-white">
                  {l("Tüm not defterleri", "All notebooks")}
                </button>
              </div>
            )
          ) : welcome ? (
            // With the keyboard up the rows above the input bar are what matters (as in ChatGPT).
            focused && shortScreen ? null : <Welcome />
          ) : (
            ai.messages.map((turn) =>
              turn.role === "user" ? (
                <UserBubble key={turn.id} turn={turn} />
              ) : (
                <AssistantMessage key={turn.id} turn={turn} speakingId={speakingId} onSpeak={setSpeakingId} />
              )
            )
          )}
          {/* Until the answer's bubble opens (with the engine's cards), the pipeline shows its progress. */}
          {ai.loading && !ai.messages.some((turn) => turn.pending) && <Thinking phase={ai.phase?.phase ?? null} detail={ai.phase?.detail} />}
          {ai.error && (
            <div className="flex items-start gap-3 rounded-3xl border border-[#F3C9C3] bg-[#FFF1EF]/90 px-4 py-3">
              <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-[#5E1F16]">
                {ai.error}{" "}
                <button type="button" onClick={() => shell.openSettings("trace")} className="font-semibold underline underline-offset-2">
                  {l("Ayrıntı", "Details")}
                </button>
              </p>
              {lastQuestion && !ai.loading && (
                <button
                  type="button"
                  onClick={() => ai.send(lastQuestion.content, { image: lastQuestion.image })}
                  className="app-glass-light app-glass-light-button flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-[#1C1C22]"
                >
                  <RotateCcw className="relative z-[2] size-3.5" strokeWidth={2.4} />
                  <span className="relative z-[2]">{l("Tekrar", "Retry")}</span>
                </button>
              )}
            </div>
          )}
          {ai.unsaved && (
            <p className="text-center text-[11px] font-medium text-[#8A5A00]">
              {l("Bu yanıt sohbet geçmişine kaydedilemedi.", "This reply couldn't be saved to your chat history.")}
            </p>
          )}
        </div>
      </div>

      {/* Voice mode covers the screen (like ChatGPT's); its turns land in this chat. */}
      <AnimatePresence>
        {voiceOpen && (
          <VoiceMode
            key="voice"
            askRef={askRef}
            prepareRef={prepareRef}
            messages={ai.messages}
            language={language}
            greet={ai.messages.length === 0 && !ai.loading}
            onClose={() => setVoiceOpen(false)}
            onType={() => {
              setVoiceOpen(false);
              window.setTimeout(() => composerRef.current?.focus(), 260);
            }}
            onSpeaking={setSpeakingId}
          />
        )}
      </AnimatePresence>

      {/* Bottom: the shortcuts (before the first question), then one glass bar - attach, the text,
          dictation, send or talk. Over the blue light it floats bare, as Gemini's does; over a
          conversation the page fades in under it. */}
      <div ref={composerBoxRef} className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-5">
        {/* A light veil under the bar, not a wall: the chat passes behind the glass, so its rim has
            something to bend. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-[#FBFBFD]/80 via-[#FBFBFD]/30 to-transparent transition-opacity duration-700 ${glow ? "opacity-0" : "opacity-100"}`}
        />
        <div className="relative mx-auto w-full max-w-2xl">
          <AnimatePresence initial={false}>
            {welcome && !hasText && (
              <Shortcuts
                key="shortcuts"
                mode={notebook?.mode}
                onAsk={(question) => submit(question)}
                onVoice={() => setVoiceOpen(true)}
                onPhoto={() => photoRef.current?.click()}
              />
            )}
          </AnimatePresence>
          {fileError && <p className="mb-2 px-2 text-[12px] font-medium text-[#D7263D]">{fileError}</p>}
          <AnimatePresence>
            {attachment?.kind === "image" && <AttachmentPreview key="attachment" attachment={attachment} onRemove={() => setAttachment(null)} />}
            {attachment?.kind === "data" && <DataPreview key="data" file={attachment.file} onRemove={() => setAttachment(null)} />}
            {attachment?.kind === "file" && <FilePreview key="file" attachment={attachment} onRemove={() => setAttachment(null)} />}
          </AnimatePresence>
          {/* The documents this chat can be asked about. */}
          {ai.files.length > 0 && !attachment && !welcome && (
            <div className="mb-2 flex flex-wrap gap-1.5 px-1">
              {ai.files.map((ref) => (
                <span key={ref.id} className="flex max-w-full items-center gap-1.5 rounded-full bg-white/80 py-1 pl-2.5 pr-1 text-[12.5px] text-[#3A3A44] shadow-[0_0_0_1px_rgb(20_20_40/0.08)]">
                  <FileText className="size-3.5 shrink-0 text-[#0B57D0]" strokeWidth={2.2} />
                  <span className="min-w-0 truncate">{ref.name}</span>
                  <button
                    type="button"
                    onClick={() => ai.removeFile(ref.id)}
                    aria-label={l(`${ref.name} bu sohbetten çıkarılsın`, `Take ${ref.name} out of this chat`)}
                    className="grid size-5 shrink-0 place-items-center rounded-full text-[#6B6B78] active:bg-black/[0.06]"
                  >
                    <X className="size-3" strokeWidth={2.6} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Composer>
            <AttachButton onPick={pickImage} onPickFile={pickFile} />
            <textarea
              ref={composerRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => {
                setFocused(true);
                warmAi();
              }}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit(input);
                }
              }}
              rows={1}
              placeholder={
                dictating
                  ? l("Dinliyorum…", "Listening…")
                  : attachment?.kind === "file"
                    ? l("Belge hakkında sor ya da boş gönder", "Ask about the document, or just send")
                    : l("İris'e sorun", "Ask Iris")
              }
              className="relative z-[2] block max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-[11px] text-[17px] leading-[22px] text-[#1F1F1F] outline-none [field-sizing:content] placeholder:text-[#5F6368]"
            />
            <motion.button
              type="button"
              onClick={toggleDictation}
              aria-label={dictating ? l("Dikteyi bitir", "Stop dictation") : l("Sesle yaz", "Dictate")}
              className={`relative z-[2] grid size-11 shrink-0 place-items-center rounded-full ${dictating ? "bg-[#FDE3E1] text-[#C4271B]" : "text-[#1F1F1F]"}`}
              whileTap={{ scale: 0.88 }}
            >
              {dictating && !reduce && (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-[#F28B82]"
                  animate={{ scale: [1, 1.35], opacity: [0.45, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity }}
                />
              )}
              <Mic className="relative size-[22px]" strokeWidth={1.9} />
            </motion.button>
            <AnimatePresence mode="popLayout" initial={false}>
              {hasText ? (
                <motion.button
                  key="send"
                  type="button"
                  onClick={() => submit(input)}
                  disabled={ai.busy || preparing}
                  aria-label={l("Gönder", "Send")}
                  className="relative z-[2] grid size-11 shrink-0 place-items-center rounded-full bg-[#0B57D0] text-white shadow-[inset_0_1px_1px_rgb(255_255_255/0.35),0_6px_14px_-6px_rgb(11_87_208/0.7)] disabled:opacity-40"
                  initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduce ? undefined : { scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 30 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {ai.loading ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-[22px]" strokeWidth={2.3} />}
                </motion.button>
              ) : (
                <motion.button
                  key="voice"
                  type="button"
                  onClick={() => {
                    stopSpeaking();
                    setSpeakingId(null);
                    setVoiceOpen(true);
                  }}
                  aria-label={l("Sesli sohbet", "Voice chat")}
                  className="relative z-[2] grid size-11 shrink-0 place-items-center rounded-full bg-[#D3E3FD] text-[#0842A0] shadow-[inset_0_1px_1px_rgb(255_255_255/0.8)]"
                  initial={reduce ? false : { scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduce ? undefined : { scale: 0.7, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 30 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <AudioLines className="size-[22px]" strokeWidth={2} />
                </motion.button>
              )}
            </AnimatePresence>
          </Composer>
        </div>
      </div>

      {/* The welcome shortcut "solve a photo" opens the picker straight from its tap. */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void pickImage(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {renaming && notebook && (
        <PromptDialog
          title={l("Yeniden adlandır", "Rename")}
          initial={notebook.title}
          placeholder={l("Not defterinin adı", "Notebook name")}
          max={90}
          onSave={(title) => updateNotebook(notebook.id, { title: title.trim() || notebook.title }, false)}
          onClose={() => setRenaming(false)}
        />
      )}
      {deleting && notebook && (
        <ConfirmDialog
          title={l("Not defteri silinsin mi?", "Delete notebook?")}
          text={l(
            "Not defteri, kaynakları ve talimatları bu cihazdan silinir. Sohbetleri geçmişinde kalır.",
            "The notebook, its sources and instructions are removed from this device. Its chats stay in your history."
          )}
          confirmLabel={l("Sil", "Delete")}
          onConfirm={() => {
            deleteNotebook(notebook.id);
            router.replace("/dashboard/notebooks/");
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </main>
  );
}

/** The input bar: one pill of liquid glass, its rim bending the blue light behind it. */
/**
 * The input bar: clear liquid glass. The page shows through it, magnified a touch in the middle and
 * bent hard towards the rim - a thick lens edge, a little apart by colour - with light caught along
 * the outline (.app-glass-lens).
 */
function Composer({ children }: { children: React.ReactNode }) {
  const { bind, style: glassStyle, filter: lensFilter } = useLiquidGlass<HTMLDivElement>({
    magnify: 1.04,
    radius: 28,
    rimStart: 0.3,
    rimReach: 0.9,
    blur: 3,
    saturate: 1.8,
  });
  return (
    <div ref={bind} style={glassStyle} className="app-glass-light app-glass-lens flex items-end gap-0.5 rounded-[28px] p-1.5">
      {lensFilter}
      {children}
    </div>
  );
}

function UserBubble({ turn }: { turn: ReturnType<typeof useAiConversation>["messages"][number] }) {
  const l = useL();
  const reduce = useReducedMotion();
  const [showText, setShowText] = useState(false);
  const [viewing, setViewing] = useState(false);
  return (
    <motion.div
      className="flex flex-col items-end gap-1.5"
      initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      {turn.image?.thumb && (
        <button
          type="button"
          onClick={() => setViewing(true)}
          aria-label={l("Fotoğrafı tam ekran aç", "Open the photo full screen")}
          className="group relative max-w-[70%] overflow-hidden rounded-3xl shadow-[0_6px_18px_-8px_rgb(30_20_60/0.35)] transition active:scale-[0.98]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL */}
          <img src={turn.image.thumb} alt="" className="block max-h-48 object-cover" />
          <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <Expand className="size-3.5" strokeWidth={2.6} />
          </span>
        </button>
      )}
      {viewing && turn.image?.thumb && <ImageViewer src={turn.image.full ?? turn.image.thumb} onClose={() => setViewing(false)} />}
      {turn.image && !turn.image.thumb && (
        <span className="flex items-center gap-1.5 rounded-full bg-[#EDECF3] px-3 py-1 text-[12px] font-medium text-[#5B5B69]">
          <ImagePlus className="size-3.5" strokeWidth={2.2} /> {l("Fotoğraf", "Photo")}
        </span>
      )}
      {turn.file && (
        <span className="app-glass-light flex max-w-[85%] items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] font-semibold text-[#1C1C22]">
          <FileText className="relative z-[2] size-4 shrink-0 text-[#3F63D8]" strokeWidth={2.2} />
          <span className="relative z-[2] truncate">{turn.file.name}</span>
          <span className="relative z-[2] shrink-0 font-medium text-[#7A7A86]">· {turn.file.detail}</span>
        </span>
      )}
      {turn.data && (
        <span className="app-glass-light flex max-w-[85%] items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] font-semibold text-[#1C1C22]">
          <FileSpreadsheet className="relative z-[2] size-4 shrink-0 text-[#1F8A70]" strokeWidth={2.2} />
          <span className="relative z-[2] truncate">{turn.data.name}</span>
          <span className="relative z-[2] shrink-0 font-medium text-[#7A7A86]">· {turn.data.csv.split("\n").length - 1} {l("satır", "rows")}</span>
        </span>
      )}
      <div className="max-w-[84%] whitespace-pre-wrap rounded-[24px] rounded-tr-[8px] bg-[#E9EEF6] px-4 py-2.5 text-[15.5px] leading-snug text-[#1F1F1F]">
        {turn.voice && <Mic className="mr-1 inline size-3.5 -translate-y-px text-[#0B57D0]" strokeWidth={2.6} />}
        {turn.content}
      </div>
      {turn.image && (turn.image.note.text || turn.image.note.color) && (
        <button type="button" onClick={() => setShowText((v) => !v)} className="flex items-center gap-1 px-1 text-[12px] font-medium text-[#7A7A86]">
          <ScanText className="size-3.5" strokeWidth={2.2} />
          {showText ? l("Okunanı gizle", "Hide what was read") : l("Fotoğraftan okunan", "Read from the photo")}
        </button>
      )}
      {showText && turn.image && (
        <div className="max-w-[85%] rounded-2xl bg-white/80 px-3.5 py-2.5 text-[12.5px] leading-snug text-[#3A3A44] shadow-[0_0_0_1px_rgb(20_20_40/0.06)]">
          {turn.image.note.color && <p className="font-semibold">{l("Renk", "Colour")}: {turn.image.note.color}</p>}
          <p className="whitespace-pre-wrap">{turn.image.note.text || l("(metin bulunamadı)", "(no text found)")}</p>
        </div>
      )}
    </motion.div>
  );
}

const PHASES: { id: Phase; tr: string; en: string }[] = [
  { id: "planning", tr: "Anla", en: "Understand" },
  { id: "computing", tr: "Hesapla", en: "Compute" },
  { id: "answering", tr: "Yanıtla", en: "Answer" },
];
/** A document being read part by part takes the place of the calculation step. */
const READING_PHASES: { id: Phase; tr: string; en: string }[] = [PHASES[0], { id: "reading", tr: "Belgeyi oku", en: "Read" }, PHASES[2]];

function Thinking({ phase, detail }: { phase: Phase | null; detail?: string }) {
  const l = useL();
  const steps = phase === "reading" ? READING_PHASES : PHASES;
  const index = phase ? steps.findIndex((p) => p.id === phase) : 0;
  const [done, total] = (detail ?? "").split("/").map(Number);
  const text =
    phase === "reading"
      ? total
        ? l(`Belge taranıyor · ${done}/${total} bölüm okundu`, `Reading the document · ${done} of ${total} parts`)
        : l("Belge taranıyor…", "Reading the document…")
      : phase === "computing"
      ? detail === "rdkit"
        ? l("RDKit yükleniyor ve yapı hesaplanıyor…", "Loading RDKit and computing the structure…")
        : detail === "action"
          ? l("Uygulamada hazırlanıyor…", "Doing it in the app…")
          : l("Hesap motoru çalışıyor…", "The engine is computing…")
      : phase === "answering"
        ? l("Yanıt yazılıyor…", "Writing the answer…")
        : l("Soruyu anlıyorum…", "Understanding the question…");
  return (
    <div className="flex items-start gap-3" role="status">
      <span className="mt-0.5">
        <AiAvatar size={28} spinning />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="iris-shimmer text-[15px] font-semibold">{text}</p>
        <div className="mt-2 flex items-center gap-1.5">
          {steps.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1.5">
              {i > 0 && <span className={`h-[2px] w-3.5 rounded-full ${i <= index ? "bg-[#4F7DF3]" : "bg-[#1C1C22]/12"}`} />}
              <span
                className={`rounded-full px-2.5 py-[3px] text-[11px] font-semibold transition-colors ${
                  i < index ? "bg-[#E4F5E9] text-[#1E7B34]" : i === index ? "bg-[#E3ECFD] text-[#0B57D0]" : "bg-[#1C1C22]/[0.05] text-[#9A9AA4]"
                }`}
              >
                {l(p.tr, p.en)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AttachButton({ onPick, onPickFile }: { onPick: (file: File | undefined) => void; onPickFile: (file: File | undefined) => void }) {
  const l = useL();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const item = "relative z-[2] flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-[14.5px] font-medium text-[#1C1C22] active:bg-[#1C1C22]/[0.06]";
  return (
    <div className="relative z-[2] shrink-0">
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={l("Ekle", "Add")}
        aria-expanded={open}
        className={`grid size-11 place-items-center rounded-full text-[#1F1F1F] ${open ? "bg-[#1C1C22]/[0.07]" : ""}`}
        whileTap={{ scale: 0.88 }}
      >
        <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} className="grid place-items-center">
          <Plus className="size-6" strokeWidth={1.9} />
        </motion.span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <>
            <button type="button" aria-label={l("Kapat", "Close")} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
            {/* Placed by this outer box: .app-glass-light sets its own position (relative), which would
                put the menu in the input bar's row and squeeze the text field. */}
            <motion.div
              className="absolute bottom-full left-0 z-40 mb-3 w-[230px]"
              initial={reduce ? false : { opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
              style={{ transformOrigin: "bottom left" }}
            >
              <div className="app-glass-light rounded-[22px] p-1.5">
              {/* The inputs sit inside the labels, so the tap itself opens the picker (a WebView loses
                  the user gesture if a menu handler calls input.click() while closing). */}
              <label className={item}>
                <span className="grid size-8 place-items-center rounded-full bg-[#E7EEFE] text-[#3F63D8]">
                  <Camera className="size-[17px]" strokeWidth={2.2} />
                </span>
                {l("Fotoğraf çek", "Take a photo")}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    setOpen(false);
                    onPick(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              <label className={item}>
                <span className="grid size-8 place-items-center rounded-full bg-[#F3E8FD] text-[#8B45C9]">
                  <ImagePlus className="size-[17px]" strokeWidth={2.2} />
                </span>
                {l("Galeriden seç", "Choose from gallery")}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    setOpen(false);
                    onPick(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              <label className={item}>
                <span className="grid size-8 place-items-center rounded-full bg-[#E3F5EE] text-[#1F8A70]">
                  <Files className="size-[17px]" strokeWidth={2.2} />
                </span>
                <span className="flex min-w-0 flex-col">
                  {l("Dosyalar", "Files")}
                  <span className="text-[11.5px] font-normal text-[#7A7A86]">{l("PDF, Word, sunum, tablo, metin", "PDF, Word, slides, sheets, text")}</span>
                </span>
                <input
                  type="file"
                  accept={FILE_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    setOpen(false);
                    onPickFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The document being added: read on the phone page by page (scans with text recognition). */
function FilePreview({ attachment, onRemove }: { attachment: Extract<Attachment, { kind: "file" }>; onRemove: () => void }) {
  const l = useL();
  const locale = useLocale();
  const language = locale.startsWith("en") ? "en" : "tr";
  const reduce = useReducedMotion();
  const { doc, progress } = attachment;
  const detail = doc
    ? `${kindLabel(doc.kind, language)} · ${countLabel(doc, language)}${doc.scanned ? l(` · ${doc.scanned} taranmış sayfa okundu`, ` · ${doc.scanned} scanned pages read`) : ""}`
    : progress?.what === "scan"
      ? l(`Taranmış sayfalar okunuyor · ${progress.done}/${progress.total}`, `Reading scanned pages · ${progress.done} of ${progress.total}`)
      : progress
        ? l(`Okunuyor · ${progress.done}/${progress.total} sayfa`, `Reading · page ${progress.done} of ${progress.total}`)
        : l("Okunuyor…", "Reading…");
  return (
    <motion.div
      className="app-glass-light mb-2 flex items-center gap-2.5 rounded-[20px] p-2"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
      <span className="relative z-[2] grid size-11 shrink-0 place-items-center rounded-xl bg-[#E7EEFE] text-[#3F63D8]">
        {attachment.status === "reading" ? <Loader2 className="size-5 animate-spin" /> : <FileText className="size-6" strokeWidth={2.1} />}
      </span>
      <div className="relative z-[2] min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[#1C1C22]">{attachment.name}</p>
        <p className="mt-0.5 truncate text-[11.5px] font-medium text-[#7A7A86]">{detail}</p>
        {doc && <p className="mt-0.5 truncate text-[11.5px] text-[#8E8E98]">{l("İris bu belgeyi tarayıp sorularını yanıtlar.", "Iris can search it and answer your questions.")}</p>}
      </div>
      <button type="button" onClick={onRemove} aria-label={l("Kaldır", "Remove")} className="relative z-[2] grid size-8 shrink-0 place-items-center rounded-full bg-[#1C1C22]/[0.06] text-[#4A4A55]">
        <X className="size-4" strokeWidth={2.4} />
      </button>
    </motion.div>
  );
}

function DataPreview({ file, onRemove }: { file: ReadDataFile; onRemove: () => void }) {
  const l = useL();
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="app-glass-light mb-2 flex items-center gap-2.5 rounded-[20px] p-2"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
      <span className="relative z-[2] grid size-11 shrink-0 place-items-center rounded-xl bg-[#E3F5EE] text-[#1F8A70]">
        <FileSpreadsheet className="size-6" strokeWidth={2.1} />
      </span>
      <div className="relative z-[2] min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[#1C1C22]">{file.name}</p>
        <p className="mt-0.5 text-[11.5px] font-medium text-[#7A7A86]">
          {l(`${file.rows} satır · ${file.columns.length} sütun`, `${file.rows} rows · ${file.columns.length} columns`)}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-[#8E8E98]">{file.columns.join(" · ")}</p>
      </div>
      <button type="button" onClick={onRemove} aria-label={l("Kaldır", "Remove")} className="relative z-[2] grid size-8 shrink-0 place-items-center rounded-full bg-[#1C1C22]/[0.06] text-[#4A4A55]">
        <X className="size-4" strokeWidth={2.4} />
      </button>
    </motion.div>
  );
}

/** "2 soru, 3 yapı, 1 tepkime okundu": what the vision model found on the photo. */
function visionSummary(reading: VisionReading, l: <T>(tr: T, en: T) => T): string {
  const parts = [
    reading.sorular.length ? l(`${reading.sorular.length} soru`, `${reading.sorular.length} questions`) : "",
    reading.molekuller.length ? l(`${reading.molekuller.length} yapı`, `${reading.molekuller.length} structures`) : "",
    reading.tepkimeler.length ? l(`${reading.tepkimeler.length} tepkime`, `${reading.tepkimeler.length} reactions`) : "",
    reading.formuller.length ? l(`${reading.formuller.length} formül`, `${reading.formuller.length} formulas`) : "",
  ].filter(Boolean);
  return parts.length
    ? l(`Görsel yapay zekâ okudu: ${parts.join(", ")}`, `Read by the vision AI: ${parts.join(", ")}`)
    : l("Görsel yapay zekâ okudu", "Read by the vision AI");
}

function AttachmentPreview({ attachment, onRemove }: { attachment: Extract<Attachment, { kind: "image" }>; onRemove: () => void }) {
  const l = useL();
  const reduce = useReducedMotion();
  const [viewing, setViewing] = useState(false);
  const status =
    attachment.status === "preparing"
      ? l("Fotoğraf hazırlanıyor…", "Preparing the photo…")
      : attachment.status === "reading"
        ? attachment.vision
          ? l("Görsel yapay zekâ inceliyor…", "The vision AI is reading it…")
          : l("Metin okunuyor (cihazda)…", "Reading the text (on the device)…")
        : attachment.status === "failed"
          ? attachment.error || l("Metin okunamadı; renk ve sorunla devam edebilirsin.", "No text read; you can still send it with your question.")
          : attachment.reading
            ? visionSummary(attachment.reading, l)
            : attachment.text
              ? l(`${attachment.text.split("\n").length} satır okundu (cihazda)`, `${attachment.text.split("\n").length} lines read (on the device)`)
              : l("Fotoğrafta metin yok", "No text on the photo");
  return (
    <motion.div
      className="app-glass-light mb-2 flex items-center gap-2.5 rounded-[20px] p-2"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
      <button
        type="button"
        onClick={() => setViewing(true)}
        aria-label={l("Fotoğrafı tam ekran aç", "Open the photo full screen")}
        className="relative z-[2] size-11 shrink-0 overflow-hidden rounded-xl transition active:scale-95"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
        <img src={attachment.thumb} alt="" className="size-full object-cover" />
      </button>
      {viewing && (
        <ImageViewer
          src={attachment.image ? `data:image/jpeg;base64,${attachment.image.base64}` : attachment.thumb}
          onClose={() => setViewing(false)}
        />
      )}
      <div className="relative z-[2] min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#1C1C22]">
          {(attachment.status === "preparing" || attachment.status === "reading") && <Loader2 className="size-3.5 animate-spin" />}
          {status}
        </p>
        {attachment.image?.color && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-medium text-[#7A7A86]">
            <span className="inline-block size-3 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.15)]" style={{ background: attachment.image.color.hex }} />
            {attachment.image.color.name}
          </p>
        )}
        {(attachment.reading?.ozet || attachment.text) && (
          <p className="mt-0.5 line-clamp-1 text-[11.5px] text-[#8E8E98]">{attachment.reading?.ozet ?? attachment.text.replace(/\n/g, " · ")}</p>
        )}
      </div>
      <button type="button" onClick={onRemove} aria-label={l("Kaldır", "Remove")} className="relative z-[2] grid size-8 shrink-0 place-items-center rounded-full bg-[#1C1C22]/[0.06] text-[#4A4A55]">
        <X className="size-4" strokeWidth={2.4} />
      </button>
    </motion.div>
  );
}

/** What the shortcuts ask. */
const STARTERS = {
  exact: { tr: "0,1 M CH₃COOH çözeltisinin pH'ı nedir? (Ka = 1,8×10⁻⁵)", en: "What is the pH of 0.1 M CH₃COOH? (Ka = 1.8×10⁻⁵)" },
  molecule: { tr: "Aspirinin yapısını göster ve özelliklerini hesapla", en: "Show aspirin's structure and compute its properties" },
  action: { tr: "5 dakikalık zamanlayıcı kur", en: "Set a 5-minute timer" },
  report: { tr: "Zaman 0, 30, 60, 90 s ve absorbans 0,82, 0,61, 0,45, 0,33 için grafik çiz", en: "Plot absorbance 0.82, 0.61, 0.45, 0.33 at 0, 30, 60, 90 s" },
};

/** The middle of an empty chat: the ChemAI wordmark (as in the menu) and one question. */
function Welcome() {
  const l = useL();
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center pb-10 text-center">
      <motion.span
        initial={reduce ? false : { opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <Wordmark height={42} />
      </motion.span>
      <motion.h2
        className="mt-4 max-w-[300px] text-[28px] font-normal leading-[1.3] tracking-[-0.01em] text-[#1F1F1F]"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      >
        {l("Hangi konuyla ilgili yardımcı olabilirim?", "What can I help you with?")}
      </motion.h2>
    </div>
  );
}

/**
 * The ways in, as ChatGPT lists them right above its input bar: a line icon and a few words per
 * row, grey, no cards - until the first question (and while the keyboard is up).
 */
function Shortcuts({ onAsk, onVoice, onPhoto, mode }: { onAsk: (question: string) => void; onVoice: () => void; onPhoto: () => void; mode?: NotebookMode }) {
  const l = useL();
  const reduce = useReducedMotion();
  const ask = (tr: string, en: string) => () => onAsk(l(tr, en));
  // In a notebook the shortcuts follow its way of working.
  const notebookRows: Record<NotebookMode, ShortcutSpec[]> = {
    organize: [
      { icon: NotebookPen, title: l("Kaynakları özetle", "Summarise sources"), run: ask("Kaynaklarımı başlıklarla özetle; hangi kaynaktan geldiğini belirt.", "Summarise my sources with headings; say which source each point is from.") },
      { icon: Calculator, title: l("Önemli değerleri çıkar", "Pull out the key values"), run: ask("Kaynaklardaki önemli sayısal değerleri birimleriyle tablo halinde çıkar ve gerekirse hesapla.", "Pull the important numbers from my sources into a table with units, computing where needed.") },
      { icon: Timer, title: l("Sonraki adımları yaz", "Write the next steps"), run: ask("Bu not defterine göre sonraki adımları madde madde yaz ve not olarak kaydet.", "List the next steps for this notebook and save them as a note.") },
    ],
    study: [
      { icon: NotebookPen, title: l("Beni test et", "Quiz me"), run: ask("Beni bu konuda test et: 5 soruyu tek tek sor, her cevabımdan sonra değerlendir.", "Quiz me on this: ask 5 questions one at a time and assess each answer.") },
      { icon: Hexagon, title: l("Adım adım anlat", "Teach me step by step"), run: ask("Bu konuyu bana baştan adım adım öğret; her adımda bir soru sor.", "Teach me this topic from the start, asking me a question at each step.") },
      { icon: Calculator, title: l("Soru çözelim", "Practice a problem"), run: ask("Bana bu konuda hesaplı bir alıştırma sorusu ver; ben çözeyim, sen hesap motoruyla kontrol et.", "Give me a calculation exercise on this; I'll solve it and you check it with the engine.") },
    ],
    lab: [
      { icon: NotebookPen, title: l("Deney planı çıkar", "Draft an experiment plan"), run: ask("Bu deney için amaç, malzeme, hesaplanmış miktarlar, adımlar ve güvenlik içeren bir plan çıkar.", "Draft a plan for this experiment: aim, materials, computed amounts, steps and safety.") },
      { icon: Calculator, title: l("Gerekli hesapları yap", "Do the calculations"), run: ask("Bu deneyde gereken tüm miktarları ve derişimleri hesapla.", "Compute every amount and concentration this experiment needs.") },
      { icon: Timer, title: l("Protokol oluştur", "Make a protocol"), run: ask("Bu deney için adım adım bir protokol oluştur.", "Create a step-by-step protocol for this experiment.") },
    ],
  };
  const rows: ShortcutSpec[] = mode
    ? [
        ...notebookRows[mode],
        { icon: Camera, title: l("Fotoğraftan çöz", "Solve a photo"), run: onPhoto },
        { icon: AudioLines, title: l("Sesli sohbet başlat", "Start a voice chat"), run: onVoice },
      ]
    : [
        { icon: AudioLines, title: l("Sesli sohbet başlat", "Start a voice chat"), run: onVoice },
        { icon: Calculator, title: l("Kesin hesap", "Exact maths"), run: () => onAsk(l(STARTERS.exact.tr, STARTERS.exact.en)) },
        { icon: Hexagon, title: l("Molekül analizi", "Molecules"), run: () => onAsk(l(STARTERS.molecule.tr, STARTERS.molecule.en)) },
        { icon: Camera, title: l("Fotoğraftan çöz", "Solve a photo"), run: onPhoto },
        { icon: Timer, title: l("İş yaptır", "Get it done"), run: () => onAsk(l(STARTERS.action.tr, STARTERS.action.en)) },
        { icon: NotebookPen, title: l("Rapor ve grafik", "Reports and graphs"), run: () => onAsk(l(STARTERS.report.tr, STARTERS.report.en)) },
      ];
  return (
    <motion.div
      className="mb-2 flex flex-col"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
    >
      {rows.map(({ icon: Icon, title, run }) => (
        <button
          key={title}
          type="button"
          // Pressing a row must not take the focus (and the keyboard) away first.
          onMouseDown={(event) => event.preventDefault()}
          onClick={run}
          className="flex h-[46px] items-center gap-[15px] rounded-full pl-[12px] pr-4 text-left text-[#5D5D5D] transition-colors active:bg-black/[0.05]"
        >
          <Icon className="size-[22px] shrink-0" strokeWidth={1.7} />
          <span className="min-w-0 truncate text-[17px] leading-[22px]">{title}</span>
        </button>
      ))}
    </motion.div>
  );
}

interface ShortcutSpec {
  icon: typeof Calculator;
  title: string;
  run: () => void;
}

/** A short screen: the keyboard is up (or the phone is small). */
function useShortViewport(limit = 560): boolean {
  const [short, setShort] = useState(false);
  useEffect(() => {
    const check = () => setShort((window.visualViewport?.height ?? window.innerHeight) < limit);
    check();
    window.visualViewport?.addEventListener("resize", check);
    window.addEventListener("resize", check);
    return () => {
      window.visualViewport?.removeEventListener("resize", check);
      window.removeEventListener("resize", check);
    };
  }, [limit]);
  return short;
}
