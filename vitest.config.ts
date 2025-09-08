/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, defineProject } from "vitest/config";

const dirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

const logicProject = defineConfig({
  plugins: [
    // biome-ignore lint/suspicious/noExplicitAny: temp
    tsconfigPaths() as any,
  ],
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
});

const uiProject = defineConfig({
  plugins: [
    // biome-ignore lint/suspicious/noExplicitAny: temp
    tsconfigPaths() as any,
    storybookTest({
      // The location of your Storybook config, main.js|ts
      configDir: path.join(dirname, ".storybook"),
      // This should match your package.json script to run Storybook
      // The --ci flag will skip prompts and not open a browser
      storybookScript: "pnpm storybook",
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
});

export default defineProject({
  test: {
    projects: [logicProject, uiProject],
  },
});
