/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";
import { mdxPlugin } from "./vite/mdxPlugin";

const dirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const storybookAppVersion = "0.0.0-vrt";

const logicProject = defineConfig({
  plugins: [mdxPlugin()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    name: "logic",
    setupFiles: ["./src/configs/vitest/vitest-setup.ts"],
    include: ["./src/**/*.test.ts", "./src/**/*.test.tsx", "./scripts/**/*.test.ts"],
    exclude: ["node_modules"],
    env: {
      VITE_CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY,
      VITE_CONVEX_URL: process.env.VITE_CONVEX_URL,
    },
  },
});

const uiProject = defineConfig({
  plugins: [
    mdxPlugin(),
    storybookTest({
      // The location of your Storybook config, main.js|ts
      configDir: path.join(dirname, ".storybook"),
      // This should match your package.json script to run Storybook
      // The --ci flag will skip prompts and not open a browser
      storybookScript: "pnpm storybook",
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(storybookAppVersion),
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "convex/react": path.resolve(dirname, ".storybook/mocks/convex-react.ts"),
      "convex/react-clerk": path.resolve(dirname, ".storybook/mocks/convex-react.ts"),
      "@clerk/react/errors": path.resolve(dirname, ".storybook/mocks/clerk-react-errors.ts"),
      "@clerk/react": path.resolve(dirname, ".storybook/mocks/clerk-react.tsx"),
    },
  },
  test: {
    name: "ui",
    // Enable browser mode
    browser: {
      enabled: true,
      // Make sure to install Playwright
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});

const convexLogicProject = defineConfig({
  test: {
    name: "convex(logic)",
    environment: "edge-runtime",
    // 全project同時実行時も、HTTP Actionや100人規模の回帰を環境負荷だけで失敗させない。
    testTimeout: 30_000,
    include: ["./convex/**/*.test.ts"],
    exclude: ["node_modules", "./convex/_generated/**", "./convex/_scenario/**"],
  },
});

const convexScenarioProject = defineConfig({
  test: {
    name: "convex(scenario)",
    environment: "edge-runtime",
    include: ["./convex/_scenario/**/*.test.ts"],
    exclude: ["node_modules", "./convex/_generated/**"],
  },
});

export default defineProject({
  test: {
    projects: [logicProject, uiProject, convexLogicProject, convexScenarioProject],
  },
});
