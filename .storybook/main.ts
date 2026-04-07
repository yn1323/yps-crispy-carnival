import path from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  refs: {
    "@chakra-ui/react": {
      disable: true,
    },
  },
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-vitest", "@storybook/addon-mcp"],
  framework: {
    name: "@storybook/react-vite",
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
      "@/src": path.resolve(__dirname, "../src"),
      "@/e2e": path.resolve(__dirname, "../e2e"),
      "@/convex": path.resolve(__dirname, "../convex"),
      "convex/react": path.resolve(__dirname, "mocks/convex-react.ts"),
      "convex/react-clerk": path.resolve(__dirname, "mocks/convex-react.ts"),
      "@clerk/clerk-react": path.resolve(__dirname, "mocks/clerk-react.tsx"),
    };

    return config;
  },
  env: (config) => ({
    ...config,
  }),
};
export default config;
