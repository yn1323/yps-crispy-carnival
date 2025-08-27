import path from "node:path";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  refs: {
    "@chakra-ui/react": {
      disable: true,
    },
  },
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  typescript: {
    reactDocgen: process.env.NODE_ENV === "development" ? "react-docgen" : "react-docgen-typescript",
  },
  staticDirs: ["../public"],
  viteFinal: async (config) => {
    if (!config.resolve) {
      return config;
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/app": path.resolve(__dirname, "../app"),
      "@/prisma": path.resolve(__dirname, "../prisma"),
      "@/src": path.resolve(__dirname, "../src"),
      "@/e2e": path.resolve(__dirname, "../e2e"),
    };

    // @clerk/nextjs/serverのBuildエラー調整
    // Node.jsモジュールの外部化とポリフィル設定
    config.define = {
      ...config.define,
      global: "globalThis",
    };

    // Node.jsモジュールを外部化してClerkの競合を回避
    config.optimizeDeps = {
      ...config.optimizeDeps,
      exclude: ["@clerk/nextjs/server"],
    };

    // Clerkのサーバーサイドモジュールを完全に外部化
    if (!config.build) config.build = {};
    if (!config.build.rollupOptions) config.build.rollupOptions = {};
    if (!config.build.rollupOptions.external) config.build.rollupOptions.external = [];

    const external = config.build.rollupOptions.external as string[];
    external.push("@clerk/nextjs/server", "path", "fs", "crypto");

    // Chromatic TurboSnap用のstats生成設定
    if (!config.build.rollupOptions.output) {
      config.build.rollupOptions.output = {};
    }

    // outputが配列でない場合のみ設定を追加
    if (!Array.isArray(config.build.rollupOptions.output)) {
      config.build.rollupOptions.output.manualChunks = (id) => {
        // node_modulesは別チャンクに分離
        if (id.includes("node_modules")) {
          if (id.includes("@chakra-ui")) return "chakra";
          if (id.includes("@clerk")) return "clerk";
          if (id.includes("react")) return "react";
          return "vendor";
        }
        // storiesファイルは別チャンクに
        if (id.includes(".stories.")) return "stories";
      };

      // ファイル命名規則を設定
      config.build.rollupOptions.output.chunkFileNames = "assets/[name]-[hash].js";
      config.build.rollupOptions.output.entryFileNames = "assets/[name]-[hash].js";
    }

    return config;
  },
  env: (config) => ({
    ...config,
    CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY ?? "",
    STORYBOOK_CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY ?? "",
  }),
};
export default config;
