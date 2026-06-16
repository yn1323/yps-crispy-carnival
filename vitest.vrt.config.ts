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
const vrtOutputDir = path.join(dirname, "vrt-actual");

type VrtViewportName = "desktop" | "mobile1" | "mobile2";

type VrtViewport = {
  width: number;
  height: number;
};

const vrtViewports = {
  desktop: { width: 1280, height: 720 },
  mobile1: { width: 320, height: 568 },
  mobile2: { width: 414, height: 896 },
} satisfies Record<VrtViewportName, VrtViewport>;

const mobileTags = {
  mobile1: "vrt-mobile1",
  mobile2: "vrt-mobile2",
} satisfies Record<Exclude<VrtViewportName, "desktop">, string>;

const createVrtProject = (
  name: `vrt-${VrtViewportName}`,
  viewport: VrtViewport,
  tags: { include?: string[]; exclude?: string[] },
) =>
  defineConfig({
    plugins: [
      // biome-ignore lint/suspicious/noExplicitAny: temp
      tsconfigPaths() as any,
      storybookTest({
        configDir: path.join(dirname, ".storybook"),
        storybookScript: "pnpm storybook",
        tags: {
          ...tags,
          exclude: ["docs-only", ...(tags.exclude ?? [])],
        },
      }),
      storycap({
        viewport,
        output: {
          dir: vrtOutputDir,
          file: "[id].png",
        },
      }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(storybookAppVersion),
      __VRT_VIEWPORT__: JSON.stringify(viewport),
    },
    resolve: {
      alias: {
        "convex/react": path.resolve(dirname, ".storybook/mocks/convex-react.ts"),
        "convex/react-clerk": path.resolve(dirname, ".storybook/mocks/convex-react.ts"),
        "@clerk/clerk-react": path.resolve(dirname, ".storybook/mocks/clerk-react.tsx"),
      },
    },
    test: {
      name,
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        viewport,
        instances: [{ browser: "chromium" }],
      },
      setupFiles: ["./.storybook/vitest.vrt.setup.ts"],
    },
  });

export default defineProject({
  test: {
    projects: [
      createVrtProject("vrt-desktop", vrtViewports.desktop, {
        exclude: Object.values(mobileTags),
      }),
      createVrtProject("vrt-mobile1", vrtViewports.mobile1, {
        include: [mobileTags.mobile1],
      }),
      createVrtProject("vrt-mobile2", vrtViewports.mobile2, {
        include: [mobileTags.mobile2],
      }),
    ],
  },
});
