import tanstackRouter from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [tanstackRouter({ autoCodeSplitting: true }), viteReact(), tsconfigPaths()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
