import { Suspense } from "react";
import ProtocolsScreen from "@/mobile/iris/protocols/ProtocolsScreen";

// ChemAI: the Protocols module (?protocol=<id> opens one, &run=1 starts its run).
export default function ProtocolsPage() {
  return (
    <Suspense>
      <ProtocolsScreen />
    </Suspense>
  );
}
