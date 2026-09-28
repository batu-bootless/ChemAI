import { Suspense } from "react";
import NewNotebookScreen from "@/mobile/iris/NewNotebookScreen";

export default function NewNotebookPage() {
  return (
    <Suspense>
      <NewNotebookScreen />
    </Suspense>
  );
}
