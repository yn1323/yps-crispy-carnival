import path from "node:path";
import { fileURLToPath } from "node:url";
import tanstackRouter from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const dirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tanstackRouter({ autoCodeSplitting: true }), viteReact(), tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@/app": path.resolve(dirname, "./app"),
      "@/src": path.resolve(dirname, "./src"),
      "@/e2e": path.resolve(dirname, "./e2e"),
    },
  },
});
