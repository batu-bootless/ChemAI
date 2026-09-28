import { Suspense } from "react";
import SearchScreen from "@/mobile/iris/SearchScreen";

export default function SearchPage() {
  return (
    <Suspense>
      <SearchScreen />
    </Suspense>
  );
}
