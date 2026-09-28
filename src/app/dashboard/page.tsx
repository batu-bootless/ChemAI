import { Suspense } from "react";
import AiScreen from "@/mobile/ai/AiScreen";

// ChemAI: Iris is the app's main screen - chat, photo questions, voice mode, and the on-device
// calculation engine behind every answer. ?c=<chat> reopens a chat, ?q=<question> asks straight
// away, ?voice=1 opens voice mode.
export default function AiPage() {
  return (
    <div className="app-light min-h-screen bg-[#FAF8F9]">
      <Suspense>
        <AiScreen />
      </Suspense>
    </div>
  );
}
