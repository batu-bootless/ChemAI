import { Suspense } from "react";
import LibraryScreen from "@/mobile/iris/LibraryScreen";

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryScreen />
    </Suspense>
  );
}
