import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import pkg from "../package.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    config.define = {
      ...config.define,
      __APP_VERSION__: JSON.stringify(pkg.version),
    };
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        "@/app": path.resolve(__dirname, "../app"),
        "@/src": path.resolve(__dirname, "../src"),
        "@/e2e": path.resolve(__dirname, "../e2e"),
        "@/convex": path.resolve(__dirname, "../convex"),
      },
    };

    // resolve.alias は Storybook の dep optimizer より後に評価されるため、
    // convex/react 等のモック差し替えには resolveId フックを使う
    config.plugins = [
      ...(config.plugins ?? []),
      {
        name: "storybook-mock-modules",
        enforce: "pre" as const,
        resolveId(id: string) {
          if (id === "convex/react" || id === "convex/react-clerk") {
            return path.resolve(__dirname, "mocks/convex-react.ts");
          }
          if (id === "@clerk/clerk-react") {
            return path.resolve(__dirname, "mocks/clerk-react.tsx");
          }
        },
      },
    ];

    return config;
  },
  env: (config) => ({
    ...config,
  }),
};
export default config;
