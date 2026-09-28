// Chem+ app: listening the way a person does, for ChemPlus AI's voice mode.
//
// A speech recognizer ends a phrase at the first pause; a person knows whether the other one has
// finished. endOfTurn() reads the words so far: a question particle, a question word or a request
// ("…pH'ı nedir?", "…denkleştir") means done, so the answer can come quickly; a sentence hanging
// on "ve", "ile", "çünkü", "şey" or a bare number means more is coming, so it waits longer.
//
// voiceCommand() picks out the few words that are about the conversation rather than chemistry -
// "tekrar et", "daha yavaş", "dur", "görüşürüz" - so the voice mode can act on them at once.

export type TurnLanguage = "tr" | "en";
export type TurnVerdict = "complete" | "incomplete" | "unsure";

function words(text: string, language: TurnLanguage): string[] {
  return text
    .toLocaleLowerCase(language === "tr" ? "tr" : "en")
    .replace(/[“”"'’.,;:!?…]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const TR_OPEN = new Set([
  "ve", "veya", "yahut", "ya", "ile", "ama", "fakat", "ancak", "çünkü", "yani", "mesela", "örneğin", "şey", "e", "ee", "eee",
  "ı", "ıı", "ııı", "hmm", "hım", "bir", "bu", "şu", "için", "gibi", "kadar", "göre", "de", "da", "ki", "eğer", "hem", "sonra",
  "önce", "olan", "olarak", "virgül", "nokta", "artı", "eksi", "çarpı", "bölü", "üzeri", "aynı", "daha", "en", "çok",
]);
const TR_QUESTION = /^(mı|mi|mu|mü|mıdır|midir|mudur|müdür|mısın|misin|musun|müsün|mısınız|misiniz|musunuz|müsünüz|mıyım|miyim|muyum|müyüm|mıyız|miyiz|nedir|nelerdir|neydi|nasıl|nasıldır|neden|niçin|niye|kaç|kaçtır|hangisi|hangileri|nerede|kim|kimdir)$/;
const TR_REQUEST =
  /^(hesapla|bul|söyle|anlat|açıkla|göster|çiz|denkleştir|yap|ver|çevir|dönüştür|hazırla|listele|özetle|karşılaştır|yaz|oku|tekrarla|başla|lütfen|teşekkürler|teşekkür|sağol|sağ|tamam|evet|hayır|olur|peki|anladım|merhaba|selam|günaydın)$/;
const TR_VERB = /(iyor|ıyor|uyor|üyor|yor)(um|uz|sun|sunuz|lar)?$|(dır|dir|dur|dür|tır|tir|tur|tür)$|(acak|ecek)(ım|im|ız|iz|sın|sin)?$|(malı|meli)(yım|yim|yız|yiz)?$|(abilir|ebilir)(im|iz|sin)?$|(ayım|eyim|alım|elim)$/;

const EN_OPEN = new Set([
  "and", "or", "but", "because", "so", "the", "a", "an", "of", "to", "with", "for", "in", "on", "at", "like", "um", "uh", "er",
  "if", "then", "than", "point", "plus", "minus", "times", "per", "is", "are", "was", "my", "your", "this", "that",
]);
const EN_START = /^(what|how|why|when|which|who|where|can|could|would|will|is|are|does|do|did|calculate|find|show|explain|balance|convert|draw|tell|give|list|compare|make|prepare)$/;
const EN_END = /^(please|thanks|thank|you|now|it|this|that|them|one|mass|ph|yield|volume|concentration)$/;

/** Is the user done talking, judging by the words alone? */
export function endOfTurn(text: string, language: TurnLanguage): TurnVerdict {
  const trimmed = text.trim();
  if (!trimmed) return "unsure";
  if (/\?\s*$/.test(trimmed)) return "complete";
  const list = words(trimmed, language);
  const last = list[list.length - 1] ?? "";
  if (language === "tr") {
    if (TR_OPEN.has(last)) return "incomplete";
    // "0,1" or "25" at the end: the unit is usually still to come.
    if (/^\d+([.,]\d+)?$/.test(last)) return "incomplete";
    if (TR_QUESTION.test(last) || TR_REQUEST.test(last)) return "complete";
    if (list.length >= 3 && last.length > 4 && TR_VERB.test(last)) return "complete";
    return "unsure";
  }
  if (EN_OPEN.has(last)) return "incomplete";
  if (/^\d+([.,]\d+)?$/.test(last)) return "incomplete";
  if (list.length >= 3 && (EN_START.test(list[0]) || EN_END.test(last))) return "complete";
  return "unsure";
}

/** Sounds like a question or a request (worth a "let me see" while the answer is worked out). */
export function isRequest(text: string, language: TurnLanguage): boolean {
  return words(text, language).length >= 3 && endOfTurn(text, language) === "complete";
}

export type VoiceCommand = "repeat" | "slower" | "faster" | "stop" | "bye";

const COMMANDS: [VoiceCommand, RegExp][] = [
  [
    "repeat",
    /^(tekrar( et| eder misin| eder misiniz| söyle| söyler misin)?( lütfen)?|tekrarla( lütfen)?|bir daha( söyle| söyler misin)?( lütfen)?|son söylediğini tekrarla|anlamadım|anlayamadım|duyamadım|ne dedin|efendim|pardon|repeat( that)?( please)?|say (that|it) again( please)?|come again|what did you say|pardon( me)?|sorry what)$/,
  ],
  ["slower", /^((daha|biraz( daha)?) )?yavaş( konuş| söyle| oku| anlat)?( lütfen)?$|^yavaşla( lütfen)?$|^((speak|talk) )?slower( please)?$|^slow down( please)?$/],
  ["faster", /^((daha|biraz( daha)?) )?hızlı( konuş| söyle| oku| anlat)?( lütfen)?$|^hızlan( lütfen)?$|^((speak|talk) )?faster( please)?$|^speed up( please)?$/],
  ["stop", /^(dur|sus|yeter|tamam yeter|kes|bekle|bir saniye bekle|stop|enough|wait|hold on|be quiet)$/],
  [
    "bye",
    /^(görüşürüz|görüşmek üzere|hoşça kal|hoşçakal|kapat|sesli sohbeti kapat|sohbeti kapat|bitir|çıkış|bu kadar|şimdilik bu kadar|teşekkürler bu kadar|goodbye|good bye|bye|bye bye|see you|that's all|that is all|close|end chat)$/,
  ],
];

/** A few words about the conversation itself, not a question. */
export function voiceCommand(text: string, language: TurnLanguage): VoiceCommand | null {
  const list = words(text, language);
  if (list.length === 0 || list.length > 6) return null;
  const phrase = list.join(" ");
  for (const [command, pattern] of COMMANDS) if (pattern.test(phrase)) return command;
  return null;
}

const LEADING_HESITATION = /^(?:\s*(?:ı+|e{2,}|hm+|hı+m+|şey|um+|uh+|er+)(?=[\s,]|$)[\s,]*)+/i;
const TRAILING_HESITATION = /(?:[\s,]+(?:ı+|e{2,}|hm+|hı+m+|um+|uh+))+[\s,]*$/i;

/** Drops hesitation sounds around what was said ("ııı", "eee", "hmm"). */
export function tidyTranscript(text: string): string {
  return text.replace(LEADING_HESITATION, "").replace(TRAILING_HESITATION, "").replace(/\s{2,}/g, " ").trim();
}
