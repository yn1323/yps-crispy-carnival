import tanstackRouter from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import pkg from "./package.json" with { type: "json" };
import { markdownFrontmatterPlugin } from "./vite/markdownFrontmatterPlugin";

export default defineConfig({
  plugins: [markdownFrontmatterPlugin(), tanstackRouter({ autoCodeSplitting: true }), viteReact(), tsconfigPaths()],
  server: {
    allowedHosts: [".ngrok.app", ".ngrok-free.app"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
