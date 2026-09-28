import { Suspense } from "react";
import DocumentsScreen from "@/mobile/iris/DocumentsScreen";

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsScreen />
    </Suspense>
  );
}
