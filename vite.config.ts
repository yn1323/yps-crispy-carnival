import tanstackRouter from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import pkg from "./package.json" with { type: "json" };
import { mdxPlugin } from "./vite/mdxPlugin";

export default defineConfig({
  plugins: [
    mdxPlugin(),
    tanstackRouter({
      autoCodeSplitting: true,
      routeFileIgnorePattern: "\\.test\\.[jt]sx?$",
    }),
    viteReact({ include: /\.(js|jsx|mdx|ts|tsx)$/ }),
    tsconfigPaths(),
  ],
  server: {
    allowedHosts: [".ngrok.app", ".ngrok-free.app"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
