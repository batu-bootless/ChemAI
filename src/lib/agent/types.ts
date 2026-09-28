// Chem+ app: what Iris's actions in the app's modules hand back for their cards in the chat.
// (src/lib/agent/actions.ts does the work; src/components/ai/AgentCards.tsx draws the cards.)

import type { GraphSpec } from "@/lib/graph-studio/types";

export interface TimerCardData {
  id: string;
  label: string;
  seconds: number;
}

export interface NoteCardData {
  id: string;
  title: string;
  /** The note as plain lines ("# " headings, "- " items), for the card. */
  text: string;
  /** False when the note was deleted since. */
  exists: boolean;
}

export interface ProtocolCardData {
  id: string;
  emoji: string;
  title: string;
  description: string;
  materials: string[];
  steps: { title: string; description: string; minutes: number | null }[];
  exists: boolean;
}

export interface InventoryCardData {
  id: string;
  name: string;
  formula: string;
  amount: string;
  unit: string;
  location: string;
  lot: string;
  expiry: string;
  /** The safety card the bottle was linked to, when its name matched one. */
  linked: string | null;
  exists: boolean;
}

export interface ReportCardData {
  id: string;
  code: string;
  title: string;
  /** The report's filled sections, heading and text, for the card. */
  sections: [string, string][];
  /** The PDF: made and saved, could not be made, or not asked for. */
  pdf: "saved" | "failed" | "none";
  fileName: string;
  exists: boolean;
}

export interface GraphCardData {
  spec: GraphSpec;
  exists: boolean;
}
