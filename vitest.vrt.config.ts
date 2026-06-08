/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import storycap from "@storycap-testrun/browser/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, defineProject } from "vitest/config";

const dirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const storybookAppVersion = "0.0.0-vrt";
const vrtViewport = {
  width: 1920,
  height: 1080,
} as const;

const vrtProject = defineConfig({
  plugins: [
    // biome-ignore lint/suspicious/noExplicitAny: temp
    tsconfigPaths() as any,
    storybookTest({
      configDir: path.join(dirname, ".storybook"),
      storybookScript: "pnpm storybook",
      tags: {
        exclude: ["docs-only"],
      },
    }),
    storycap({
      output: {
        dir: path.join(dirname, "vrt-actual"),
        file: "[id]--1920x1080.png",
      },
      viewport: vrtViewport,
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(storybookAppVersion),
  },
  resolve: {
    alias: {
      "convex/react": path.resolve(dirname, ".storybook/mocks/convex-react.ts"),
      "convex/react-clerk": path.resolve(dirname, ".storybook/mocks/convex-react.ts"),
      "@clerk/clerk-react": path.resolve(dirname, ".storybook/mocks/clerk-react.tsx"),
    },
  },
  test: {
    name: "vrt",
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./.storybook/vitest.vrt.setup.ts"],
  },
});

export default defineProject({
  test: {
    projects: [vrtProject],
  },
});
