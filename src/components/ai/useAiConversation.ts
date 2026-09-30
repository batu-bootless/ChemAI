"use client";

import { useRef, useState } from "react";
import { askAi, askAiInConversation, type AiMessage } from "@/lib/ai/client";
import { getAiConversationMessages } from "@/lib/ai/history";
import { upsertConversation } from "@/lib/ai/historyStore";
import {
  cleanReply,
  composeWire,
  fallbackPlan,
  mightCompute,
  parseUserMessage,
  planTools,
  runCalls,
  streamingReply,
  type DataFile,
  type ImageNote,
  type Intent,
  type Phase,
  type Plan,
} from "@/lib/ai/assistant";
import { answerText } from "@/lib/ai/answerCards";
import { conversationContext } from "@/lib/ai/guide";
import { digestOf, fileBlock, fileRef, fitsWhole, relevantPassages, wantsWholeDocument, type FileRef } from "@/lib/files/ask";
import type { FileDoc } from "@/lib/files/read";
import { getDoc, linkDocs, linkedDocIds, saveDoc } from "@/lib/files/store";
import { personalBlock, readIrisPrefs } from "@/lib/ai/irisPrefs";
import { scanSafety, type SafetyScan } from "@/lib/ai/safetyScan";
import { since, trace } from "@/lib/ai/trace";
import { countUsage } from "@/lib/ai/usage";
import { verifyAnswer, type Verification } from "@/lib/ai/verify";
import { addMedia, attachMedia } from "@/lib/library/media";
import { getNotebook, notebookBlock, notebookSurface, sourcesForPlanner, touchNotebook } from "@/lib/notebooks/store";
import type { ToolOutcome } from "@/lib/chem-engine/tools";
import { textFor } from "@/mobile/i18n";
import { getLanguage } from "@/mobile/preferences";

const MAX_SENT_MESSAGES = 20;
/** The answer may take this long (the website's own limit is a minute); then the turn fails, it does not hang. */
const ANSWER_TIMEOUT_MS = 75_000;
const ACTION_TOOLS = new Set(["timer", "note", "protocol", "inventory_add", "lab_report", "graph"]);

/** One message on screen. `content` is what the user sees; `wire` is what the API gets. */
export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  wire: string;
  /** Assistant: the engine's verified results for the question before it. */
  tools?: ToolOutcome[];
  /** Assistant: what the planner took the question to be about (pH, titration…). */
  intents?: Intent[];
  /** Assistant: the tools of a reopened conversation are being run again. */
  restoring?: boolean;
  /** Assistant: produced on the device only, because the AI could not be reached. */
  local?: boolean;
  /** Assistant: the cards are the device's instant results, shown while the plan is still being made. */
  quick?: boolean;
  /** Assistant: the engine's cards are in, the AI's words are still being written. */
  pending?: boolean;
  /** Assistant, pending: the AI was busy; asked again in this many seconds. */
  waiting?: number;
  /** Assistant: the answer's numbers checked against the engine (Kanıt denetimi). */
  verification?: Verification | null;
  /** Assistant: hazards and incompatible pairs in a lab question (Güvenlik taraması). */
  safety?: SafetyScan | null;
  /** User: the photo that came with the question (on this device only): its thumbnail, and while
   * the chat is open the sharper copy the full-screen viewer shows. */
  image?: { thumb?: string; full?: string; note: ImageNote };
  /** User: a data file (CSV) that came with the question. */
  data?: DataFile;
  /** User: a document (PDF, Word…) that came with the question: its name and what it is. */
  file?: { name: string; detail: string };
  voice?: boolean;
}

export interface SendOptions {
  fresh?: boolean;
  image?: { thumb?: string; full?: string; note: ImageNote };
  data?: DataFile;
  /** A document read on the phone (lib/files/read.ts): it joins the chat, and every later question sees it too. */
  file?: FileDoc;
  voice?: boolean;
  /**
   * Called as soon as the engine has run, before the AI answers (voice mode says the result).
   * `quick`: the device's instant results, from its own rules before the plan was made; the
   * planned results follow in a second call.
   */
  onTools?: (outcomes: ToolOutcome[], turnId: string, quick?: boolean) => void;
  /** Called with the answer so far while it is being written (voice mode starts speaking it). */
  onDelta?: (text: string, turnId: string) => void;
  /** Called with the answer once it arrives (voice mode and "read answers aloud" speak it). */
  onReply?: (reply: string, turnId: string) => void;
  /** Called when the turn ends without an answer. */
  onFail?: (message: string) => void;
  /** Called when the turn was dropped because the chat moved on (a new chat, another conversation). */
  onCancel?: () => void;
}

/** A caller's callback must not break the turn (or leave it half done) by throwing. */
function safely(name: string, run: () => unknown) {
  try {
    const result = run();
    if (result instanceof Promise) result.catch((error: unknown) => trace("pipeline", `${name} hata: ${String(error)}`));
  } catch (error) {
    trace("pipeline", `${name} hata: ${String(error)}`);
  }
}

let turnCounter = 0;
const newId = () => `t${Date.now().toString(36)}${(turnCounter++).toString(36)}`;

function toWire(turn: ChatTurn): AiMessage {
  return { role: turn.role, content: turn.wire || turn.content };
}

function turnFromStored(message: AiMessage): ChatTurn {
  if (message.role === "assistant") {
    const content = cleanReply(message.content);
    // History goes back to the AI as sentences, not as the cards' JSON.
    return { id: newId(), role: "assistant", content, wire: answerText(content) };
  }
  const parsed = parseUserMessage(message.content);
  return {
    id: newId(),
    role: "user",
    content: parsed.text || textFor("(fotoğraf)", "(photo)"),
    wire: message.content,
    image: parsed.image ? { note: parsed.image } : undefined,
    data: parsed.data ?? undefined,
    file: parsed.file ?? undefined,
    voice: parsed.voice,
  };
}

/** Kanıt denetimi and güvenlik taraması for one answer, as the settings allow. */
function checks(question: string, reply: string, outcomes: ToolOutcome[], intents: Intent[]) {
  const prefs = readIrisPrefs();
  const language = getLanguage() === "en" ? "en" : "tr";
  return {
    verification: prefs.verify ? verifyAnswer(reply, outcomes, question, language) : null,
    safety: prefs.safety ? scanSafety([question, reply], outcomes, intents) : null,
  };
}

/** Pictures for the Library: the photo asked about and the structures the engine drew. */
async function keepMedia(question: string, outcomes: ToolOutcome[], image: SendOptions["image"], notebookId: string | null): Promise<string[]> {
  const ids: string[] = [];
  if (image?.thumb) {
    const id = await addMedia({ kind: "photo", title: question.slice(0, 120), thumb: image.thumb, text: image.note.text.slice(0, 2000), notebookId });
    if (id) ids.push(id);
  }
  for (const outcome of outcomes) {
    if (!outcome.ok || outcome.tool !== "molecule" || !outcome.data.svg) continue;
    const id = await addMedia({
      kind: "molecule",
      title: outcome.data.name || outcome.data.formula,
      svg: outcome.data.svg,
      smiles: outcome.data.canonicalSmiles,
      formula: outcome.data.formula,
      notebookId,
    });
    if (id) ids.push(id);
  }
  return ids;
}

// Conversation state of Iris's screen: each turn runs through the calculation engine
// (src/lib/ai/assistant.ts) before the AI answers, turns are saved server-side (unless the user
// turned history off), and saved conversations reopen with their result cards rebuilt. In a
// notebook (`notebookId`) every turn carries the notebook's way of working and its sources.
export function useAiConversation({
  context,
  surface,
  notebookId = null,
  onConversation,
}: {
  context?: string;
  surface: string;
  notebookId?: string | null;
  /** Called when the chat on screen becomes a saved conversation, or stops being one. */
  onConversation?: (id: string | null) => void;
}) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<{ phase: Phase; detail?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  // The documents of the chat on screen: each question is answered with what it needs of them.
  const [files, setFilesState] = useState<FileRef[]>([]);
  const filesRef = useRef<FileRef[]>([]);
  const setFiles = (list: FileRef[]) => {
    filesRef.current = list;
    setFilesState(list);
  };
  // Bumped whenever the shown conversation changes, so a reply that arrives for a
  // conversation the user already left is dropped from view (the server saved it).
  const viewRef = useRef(0);
  const onConversationRef = useRef(onConversation);
  onConversationRef.current = onConversation;

  const setConversationId = (id: string | null) => {
    setConversationIdState(id);
    safely("onConversation", () => onConversationRef.current?.(id));
  };

  const busy = loading || openingId !== null;

  // A plan made ahead (voice mode: while the user is finishing the question), used when the
  // question that is sent is the same one in the same conversation.
  const early = useRef<{ key: string; plan: Promise<Plan> } | null>(null);
  const planKey = (question: string, count: number) => `${notebookId ?? ""}|${conversationId ?? ""}|${count}|${question.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`;

  /** Starts planning a question that is about to be sent (only one that may need the engine). */
  const prepare = (text: string) => {
    const question = text.trim();
    if (!question || busy || !mightCompute(question)) return;
    const key = planKey(question, messages.length);
    if (early.current?.key === key) return;
    const notebook = getNotebook(notebookId);
    const plan = planTools({ question, history: messages.map(toWire), voice: true, sources: sourcesForPlanner(notebook, question) });
    plan.catch(() => undefined);
    early.current = { key, plan };
    trace("plan", `önceden planlanıyor: ${question.slice(0, 60)}`);
  };

  /** Returns false when nothing was sent (empty text, or a reply or conversation is still loading). */
  const send = (text: string, options: boolean | SendOptions = {}): boolean => {
    const opts: SendOptions = typeof options === "boolean" ? { fresh: options } : options;
    const fresh = opts.fresh ?? false;
    const content = text.trim();
    if ((!content && !opts.image && !opts.data && !opts.file) || (!fresh && busy)) return false;
    const question =
      content ||
      (opts.file
        ? textFor("Bu belgeyi tara ve özetle.", "Scan this document and summarise it.")
        : opts.data
          ? textFor("Bu veriyi analiz et.", "Analyse this data.")
          : textFor("Bu fotoğraftaki kimya sorusunu çöz.", "Solve the chemistry question in this photo."));
    const view = fresh ? ++viewRef.current : viewRef.current;
    const currentId = fresh ? null : conversationId;
    const before = fresh ? [] : messages;
    const language = getLanguage() === "en" ? "en" : "tr";
    const attached = opts.file ? fileRef(opts.file, language) : null;
    const userTurn: ChatTurn = {
      id: newId(),
      role: "user",
      content: question,
      wire: question,
      image: opts.image,
      data: opts.data,
      file: attached ? { name: attached.name, detail: attached.detail } : undefined,
      voice: opts.voice,
    };
    const previousFiles = fresh ? [] : filesRef.current;
    const chatFiles = attached ? [...previousFiles.filter((ref) => ref.id !== attached.id), attached] : previousFiles;
    if (chatFiles !== previousFiles || fresh) setFiles(chatFiles);
    const prefs = readIrisPrefs();
    // A chat started with history off stays a temporary chat: the website answers and forgets it.
    const starting = before.length === 0;
    const isTemporary = starting ? !prefs.saveHistory : temporary;
    if (starting) setTemporary(isTemporary);
    const notebook = getNotebook(notebookId);
    if (notebook) touchNotebook(notebook.id);
    setError(null);
    setUnsaved(false);
    setMessages([...before, userTurn]);
    setLoading(true);
    setPhase(null);

    void (async () => {
      const onPhase = (next: Phase, detail?: string) => {
        if (view === viewRef.current) setPhase({ phase: next, detail });
      };
      const started = performance.now();
      trace("soru", `${opts.voice ? "sesli" : "yazılı"}: ${question.slice(0, 80)}${notebook ? ` [defter ${notebook.id}]` : ""}`);
      // The chat moved on while this turn was working: whoever asked must still hear about it.
      const dropped = () => {
        trace("soru", `bırakıldı (sohbet değişti) ${since(started)}`);
        safely("onCancel", () => opts.onCancel?.());
      };
      let outcomes: ToolOutcome[] = [];
      let intents: Intent[] = [];
      let mediaIds: string[] = [];
      const answerId = newId();
      // Anında sonuç: what the device's own rules can compute (an equation, a molar mass, a pH…)
      // is shown - and said - at once, while the plan (a call to the AI) is still being made.
      let planned = false;
      const quick =
        !opts.image && mightCompute(question) ? fallbackPlan(question, opts.data).filter((call) => !ACTION_TOOLS.has(call.tool)) : [];
      const quickRun = quick.length ? runCalls(quick, language) : Promise.resolve([] as ToolOutcome[]);
      if (quick.length) {
        void quickRun.then((found) => {
          if (planned || view !== viewRef.current || !found.some((outcome) => outcome.ok)) return;
          trace("plan", `anında sonuç ${since(started)}: ${found.map((outcome) => outcome.tool).join(", ")}`);
          setMessages((prev) =>
            prev.some((turn) => turn.id === answerId)
              ? prev
              : [...prev, { id: answerId, role: "assistant", content: "", wire: "", tools: found, pending: true, quick: true }]
          );
          safely("onTools", () => opts.onTools?.(found, answerId, true));
        });
      }
      try {
        // The chat's documents, read back from the phone (the one just added is at hand).
        const docs = (await Promise.all(chatFiles.map((ref) => (ref.id === opts.file?.id ? opts.file : getDoc(ref.id))))).filter(
          (doc): doc is FileDoc => Boolean(doc)
        );
        if (view !== viewRef.current) return dropped();
        const past = before.map(toWire);
        const key = planKey(question, before.length);
        const ahead = !fresh && !opts.image && !opts.data && early.current?.key === key ? early.current.plan : null;
        early.current = null;
        if (ahead) trace("plan", "önceden yapılan plan kullanılıyor");
        const plan = await (ahead ??
          planTools({
            question,
            history: past,
            image: opts.image?.note,
            data: opts.data,
            voice: opts.voice,
            sources: notebook ? sourcesForPlanner(notebook, question) : docs.length ? relevantPassages(docs, question, 1400) : undefined,
            onPhase,
          }));
        planned = true;
        if (view !== viewRef.current) return dropped();
        intents = plan.intents;
        // Settings → Eylemler ve otomasyon: with actions off Iris only computes and explains.
        const blocked = prefs.actions ? [] : plan.calls.filter((call) => ACTION_TOOLS.has(call.tool));
        const calls = prefs.actions ? plan.calls : plan.calls.filter((call) => !ACTION_TOOLS.has(call.tool));
        outcomes = await runCalls(calls, language, onPhase);
        // An instant result the plan did not ask for again still stands (the plan decides the
        // rest): its card stays, and the AI is given it.
        const instant = (await quickRun).filter((outcome) => outcome.ok && !calls.some((call) => call.tool === outcome.tool));
        outcomes = [...outcomes, ...instant];
        if (view !== viewRef.current) return dropped();
        const personal = personalBlock();
        let documents = "";
        if (docs.length) {
          // What is left of a message for the documents, after the question, the engine's results,
          // the notebook, the user's own context and the voice rules.
          const results = outcomes.length ? Math.min(2600, 700 + outcomes.reduce((sum, outcome) => sum + (outcome.ok ? outcome.llm.length : 80), 0)) : 0;
          const budget = Math.max(1500, Math.min(6000, 7300 - question.length - results - personal.length - (opts.voice ? 1300 : 0) - (notebook ? 2700 : 0)));
          // "Özetle", "tara", a file sent without a question: the whole of each long file is read first.
          const digests = new Map<string, string>();
          if (wantsWholeDocument(question) || (opts.file && !content)) {
            for (const doc of docs) {
              if (fitsWhole(doc, Math.min(budget, 4200) / docs.length)) continue;
              let digest = doc.digest && doc.digestLanguage === language ? doc.digest : "";
              if (!digest) {
                try {
                  onPhase("reading", "0/0");
                  digest = await digestOf(doc, language, (done, total) => onPhase("reading", `${done}/${total}`));
                  void saveDoc({ ...doc, digest, digestLanguage: language });
                } catch (error) {
                  trace("belge", `özet çıkarılamadı: ${error instanceof Error ? error.message : String(error)}`);
                }
              }
              if (view !== viewRef.current) return dropped();
              if (digest) digests.set(doc.id, digest);
            }
          }
          documents = fileBlock({ docs, attachedId: opts.file?.id ?? null, question, budget, digests, language });
        }
        const extra = [
          notebook ? notebookBlock(notebook, question) : "",
          documents,
          personal,
          blocked.length
            ? "⟦CHEMPLUS-AYAR⟧ Kullanıcı eylemleri ayarlardan kapattı; istenen iş (zamanlayıcı, not, protokol, envanter, rapor ya da grafik) YAPILMADI. Bunu kısaca söyle ve Ayarlar → Eylemler ve otomasyon'dan açabileceğini belirt. ⟦/CHEMPLUS-AYAR⟧"
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        const wire = composeWire({ question, outcomes, intents, image: opts.image?.note, data: opts.data, voice: opts.voice, context: extra });
        // The answer's bubble opens now (or takes the planned cards in place of the instant ones),
        // with the engine's cards in it; the AI's words fill it later.
        const opened: ChatTurn = { id: answerId, role: "assistant", content: "", wire: "", tools: outcomes, intents, pending: true };
        setMessages((prev) => {
          const next = prev.map((turn) => (turn.id === userTurn.id ? { ...turn, wire } : turn.id === answerId ? opened : turn));
          return next.some((turn) => turn.id === answerId) ? next : [...next, opened];
        });
        safely("onTools", () => opts.onTools?.(outcomes, answerId));
        mediaIds = await keepMedia(question, outcomes, opts.image, notebook?.id ?? null);
        countUsage({
          questions: 1,
          tools: outcomes.filter((outcome) => outcome.ok && outcome.source !== "app").length,
          actions: outcomes.filter((outcome) => outcome.ok && outcome.source === "app").length,
          photos: opts.image ? 1 : 0,
          voice: opts.voice ? 1 : 0,
        });
        onPhase("answering");

        const outgoing: AiMessage[] = [...past, { role: "user" as const, content: wire }].slice(-MAX_SENT_MESSAGES);
        const asked = performance.now();
        // Spoken replies get a little more room to sound like a person, not a report.
        const temperature = opts.voice ? 0.55 : 0.35;
        // The AI busy (the free limits are per minute): the answer's bubble says it waits, then asks again.
        const onWait = (seconds: number) => {
          if (view !== viewRef.current) return;
          setMessages((prev) => prev.map((turn) => (turn.id === answerId && turn.pending ? { ...turn, waiting: seconds || undefined } : turn)));
        };
        // The answer shows (and voice mode speaks it) as it is written; the screen catches up at
        // most every few frames.
        let shown = "";
        let paint = 0;
        const onText = (raw: string) => {
          if (view !== viewRef.current) return;
          const text = streamingReply(raw);
          if (!text || text === shown) return;
          if (!shown) trace("cevap", `ilk kelimeler ${since(asked)}`);
          shown = text;
          safely("onDelta", () => opts.onDelta?.(text, answerId));
          if (paint) return;
          paint = window.setTimeout(() => {
            paint = 0;
            if (view !== viewRef.current) return;
            setMessages((prev) => prev.map((turn) => (turn.id === answerId && turn.pending ? { ...turn, content: shown } : turn)));
          }, 60);
        };
        let reply: string;
        let savedId: string | null = null;
        if (!isTemporary) {
          const res = await askAiInConversation(outgoing, {
            context: currentId ? undefined : conversationContext(context),
            conversationId: currentId,
            surface: notebook ? notebookSurface(notebook) : surface,
            temperature,
            timeoutMs: ANSWER_TIMEOUT_MS,
            onText,
            onWait,
          });
          reply = res.reply;
          const saved = res.conversation;
          if (saved) {
            upsertConversation(saved);
            savedId = saved.id;
            if (chatFiles.length) linkDocs(saved.id, chatFiles.map((ref) => ref.id));
          }
          if (view !== viewRef.current) return dropped();
          setUnsaved(!saved);
          if ((saved?.id ?? currentId) !== currentId) setConversationId(saved?.id ?? currentId);
        } else {
          reply = await askAi(outgoing, { context: conversationContext(context), temperature, timeoutMs: ANSWER_TIMEOUT_MS, onText, onWait });
          if (view !== viewRef.current) return dropped();
        }
        trace("cevap", `${since(asked)} (${reply.length} karakter)${isTemporary ? " [geçici]" : ""}; soru toplam ${since(started)}`);
        if (savedId) void attachMedia(mediaIds, savedId);
        // Never the app's own blocks, nor a "done" the app did not do (assistant.ts).
        const clean = cleanReply(reply, outcomes);
        // The answer as sentences (answerCards.ts): what is checked, spoken and sent back as history.
        const plain = answerText(clean);
        const checked = checks(question, plain, outcomes, intents);
        if (checked.verification) countUsage({ verified: checked.verification.verified.length });
        setMessages((prev) => prev.map((turn) => (turn.id === answerId ? { ...turn, content: clean, wire: plain, pending: false, ...checked } : turn)));
        safely("onReply", () => opts.onReply?.(plain, answerId));
      } catch (e) {
        trace("cevap", `hata ${since(started)}: ${e instanceof Error ? e.message : String(e)}`);
        if (view !== viewRef.current) return dropped();
        const message = e instanceof Error ? e.message : textFor("İris yanıt veremedi.", "Iris couldn't answer.");
        // The engine's results stand on their own: keep them even when the AI could not answer.
        const kept = outcomes.some((outcome) => outcome.ok);
        const safety = readIrisPrefs().safety ? scanSafety([question], outcomes, intents) : null;
        setMessages((prev) => {
          const opened = prev.some((turn) => turn.id === answerId);
          const answer: ChatTurn = {
            id: answerId,
            role: "assistant",
            content: "",
            // The next turn's history needs an answer here; this one says what happened.
            wire: textFor("(Yapay zekâ yanıtı alınamadı; yalnızca hesap motorunun sonuçları gösterildi.)", "(No AI answer; only the engine's results were shown.)"),
            tools: outcomes,
            intents,
            local: true,
            safety,
          };
          if (!kept) return prev.filter((turn) => turn.id !== answerId);
          return opened ? prev.map((turn) => (turn.id === answerId ? answer : turn)) : [...prev, answer];
        });
        setError(message);
        safely("onFail", () => opts.onFail?.(message));
      } finally {
        if (view === viewRef.current) {
          setLoading(false);
          setPhase(null);
        }
      }
    })();
    return true;
  };

  const startNewChat = () => {
    viewRef.current++;
    setConversationId(null);
    setMessages([]);
    setFiles([]);
    setError(null);
    setUnsaved(false);
    setTemporary(false);
    setLoading(false);
    setPhase(null);
    setOpeningId(null);
  };

  const openConversation = async (id: string) => {
    if (id === conversationId && !openingId) return;
    const view = ++viewRef.current;
    setOpeningId(id);
    setConversationIdState(null);
    setMessages([]);
    setFiles([]);
    setError(null);
    setUnsaved(false);
    setTemporary(false);
    setLoading(false);
    setPhase(null);
    try {
      const loaded = await getAiConversationMessages(id);
      if (view !== viewRef.current) return;
      const turns = loaded.map(turnFromStored);
      // Re-run the engine for every question that had tools, and hang the cards back on the answer.
      const pending: { answerId: string; wire: string; question: string; reply: string }[] = [];
      turns.forEach((turn, index) => {
        const next = turns[index + 1];
        if (turn.role !== "user" || next?.role !== "assistant") return;
        const parsed = parseUserMessage(turn.wire);
        next.intents = parsed.intents;
        if (parsed.calls.length) {
          next.restoring = true;
          pending.push({ answerId: next.id, wire: turn.wire, question: turn.content, reply: next.content });
        } else if (readIrisPrefs().safety) {
          next.safety = scanSafety([turn.content, answerText(next.content)], [], parsed.intents);
        }
      });
      setConversationId(id);
      setMessages(turns);
      const language = getLanguage() === "en" ? "en" : "tr";
      // Its documents, when they are on this phone.
      const kept = (await Promise.all(linkedDocIds(id).map((docId) => getDoc(docId)))).filter((doc): doc is FileDoc => Boolean(doc));
      if (view !== viewRef.current) return;
      setFiles(kept.map((doc) => fileRef(doc, language)));
      for (const item of pending) {
        const parsed = parseUserMessage(item.wire);
        const outcomes = await runCalls(parsed.calls, language, undefined, { restoring: true });
        if (view !== viewRef.current) return;
        const checked = checks(item.question, answerText(item.reply), outcomes, parsed.intents);
        setMessages((prev) => prev.map((turn) => (turn.id === item.answerId ? { ...turn, tools: outcomes, restoring: false, ...checked } : turn)));
      }
    } catch (e) {
      if (view === viewRef.current) setError(e instanceof Error ? e.message : textFor("Sohbet yüklenemedi.", "The chat couldn't be loaded."));
    } finally {
      if (view === viewRef.current) setOpeningId(null);
    }
  };

  return {
    messages,
    activeId: openingId ?? conversationId,
    conversationId,
    loading,
    phase,
    busy,
    opening: openingId !== null,
    error,
    unsaved,
    /** This chat is not being saved (history is off). */
    temporary,
    send,
    prepare,
    startNewChat,
    openConversation,
    /** The documents of the chat on screen. */
    files,
    /** Takes a document out of this chat (it stays on the phone). */
    removeFile: (id: string) => {
      const next = filesRef.current.filter((ref) => ref.id !== id);
      setFiles(next);
      if (conversationId) linkDocs(conversationId, next.map((ref) => ref.id));
    },
  };
}
