import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests (npx vitest run): the same "@/…" imports as the app (tsconfig paths).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
