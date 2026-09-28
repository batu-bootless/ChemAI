// ChemAI: the colours and measures of Iris's screens, taken from the Gemini app screenshots the
// user supplied (sampled pixels; sizes in CSS px of a 390 px wide phone).

export const IRIS = {
  /** Page background of every Gemini screen. */
  bg: "#FAF8F9",
  ink: "#0B0B0C",
  sub: "#6B696B",
  faint: "#8E8C8E",
  /** Selected menu row, document cards, the round ">" button. */
  row: "#F2F0F1",
  line: "#E6E4E5",
  placeholder: "#BCBABB",
  /** The selected card of the new-notebook screen. */
  selected: "#E0F0FD",
  disabledBg: "#DCDADB",
  disabledInk: "#817F80",
  /** Settings sheet: iOS grouped background, white cards, hairlines. */
  sheet: "#F2F1F6",
  card: "#FFFFFF",
  separator: "#ECECEC",
  sectionInk: "#68676C",
  chevron: "#C4C4C7",
  done: "#3C83ED",
  blue: "#0B57D0",
  caret: "#4F63BA",
} as const;

/** Top padding of a page header below the status bar. */
export const HEADER_TOP = 8;
