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

    return config;
  },
  env: (config) => ({
    ...config,
    STORYBOOK_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
    STORYBOOK_CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY ?? "",
  }),
};
export default config;
