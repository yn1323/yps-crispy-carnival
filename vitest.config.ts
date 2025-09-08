/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig, defineProject } from "vitest/config";

const dirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// 共通のエイリアス設定
const resolveAlias = {
  "@/src": path.resolve(dirname, "./src"),
  "@/e2e": path.resolve(dirname, "./e2e"),
};

const logicProject = defineProject({
  test: {
    globals: true,
    name: "logic",
    setupFiles: ["./src/configs/vitest/vitest-setup.ts"],
    include: ["./src/**/*.test.ts"],
    exclude: ["node_modules"],
    env: {
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
      CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
      NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    },
  },
  resolve: {
    alias: resolveAlias,
    conditions: ["mock"],
  },
});

const uiProject = defineProject({
  plugins: [
    storybookTest({
      // The location of your Storybook config, main.js|ts
      configDir: path.join(dirname, ".storybook"),
      // This should match your package.json script to run Storybook
      // The --ci flag will skip prompts and not open a browser
      storybookScript: "pnpm storybook --ci",
    }),
  ],
  test: {
    name: "ui",
    // Enable browser mode
    browser: {
      enabled: true,
      // Make sure to install Playwright
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./.storybook/vitest.setup.ts"],
  },
  resolve: {
    alias: resolveAlias,
    conditions: ["mock"],
  },
});

export default defineConfig({
  test: {
    projects: [logicProject, uiProject],
  },
});
