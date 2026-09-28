"use client";

import { useSearchParams } from "next/navigation";
import AiScreen from "@/mobile/ai/AiScreen";

/** The notebook's chat: the same Iris screen, bound to the notebook in the address. */
export default function NotebookChat() {
  const id = useSearchParams().get("id");
  // A new notebook id means a new screen, not the last notebook's chat.
  return <AiScreen key={id ?? "none"} notebookId={id} />;
}
