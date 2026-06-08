import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storybookAppVersion = "0.0.0-vrt";
const allStories = ["../src/**/*.stories.@(ts|tsx)"];
const vrtPocStories = [
  "../src/components/ui/Button/index.stories.tsx",
  "../src/components/ui/Dialog/index.stories.tsx",
  "../src/components/features/Dashboard/DashboardContent/index.stories.tsx",
  "../src/components/features/LandingPage/index.stories.tsx",
  "../src/components/features/ArticleSite/ArticleConversionCta/index.stories.tsx",
];

const config: StorybookConfig = {
  refs: {
    "@chakra-ui/react": {
      disable: true,
    },
  },
  stories: process.env.STORYBOOK_VRT_POC === "true" ? vrtPocStories : allStories,
  addons: ["@storybook/addon-docs", "@storybook/addon-vitest"],
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
      __APP_VERSION__: JSON.stringify(storybookAppVersion),
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
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: [...(config.optimizeDeps?.include ?? []), "react-icons/fc"],
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
