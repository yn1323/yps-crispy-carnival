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
    return config;
  },
  env: (config) => ({
    ...config,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  }),
};
export default config;
