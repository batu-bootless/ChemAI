import { Suspense } from "react";
import NotebooksScreen from "@/mobile/iris/NotebooksScreen";

export default function NotebooksPage() {
  return (
    <Suspense>
      <NotebooksScreen />
    </Suspense>
  );
}
