import { Suspense } from "react";
import NotebookChat from "@/mobile/iris/NotebookChat";

// ChemAI: a notebook as its own chat (?id=<notebook>, ?c=<one of its chats>).
export default function NotebookPage() {
  return (
    <div className="app-light min-h-screen bg-[#FAF8F9]">
      <Suspense>
        <NotebookChat />
      </Suspense>
    </div>
  );
}
