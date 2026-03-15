import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx", "components/**/__tests__/**/*.test.ts", "components/**/__tests__/**/*.test.tsx"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
