import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import type { PluginOption } from "vite";
import { mdxPlugin } from "../vite/mdxPlugin.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storybookAppVersion = "0.0.0-vrt";
const storybookBuildDateJst = "2026-01-13";

// Storybookがroot Vite configを読む前に、料金は決定的なfixtureへ固定する。
process.env.VITE_APP_ENVIRONMENT = "storybook";

/** Storybookはroot Vite configを読むため、複数entryを扱えないStartのapp pluginだけを外す。 */
function withoutApplicationPlugins(plugins: PluginOption[]): PluginOption[] {
  return plugins.flatMap((plugin) => {
    if (Array.isArray(plugin)) return withoutApplicationPlugins(plugin);
    if (!plugin) return [];
    if (typeof plugin.name === "string" && (plugin.name === "mdx" || plugin.name.startsWith("tanstack"))) return [];
    return [plugin];
  });
}

const config: StorybookConfig = {
  refs: {
    "@chakra-ui/react": {
      disable: true,
    },
  },
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: process.env.NODE_ENV === "development" ? "react-docgen" : "react-docgen-typescript",
  },
  viteFinal: async (config) => {
    config.define = {
      ...config.define,
      __APP_ENVIRONMENT__: JSON.stringify("local"),
      __APP_VERSION__: JSON.stringify(storybookAppVersion),
      __BUILD_DATE_JST__: JSON.stringify(storybookBuildDateJst),
      __RELEASE_ID__: JSON.stringify("storybook"),
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
      mdxPlugin(),
      ...withoutApplicationPlugins(config.plugins ?? []),
      {
        name: "storybook-mock-modules",
        enforce: "pre" as const,
        resolveId(id: string) {
          if (id === "convex/react" || id === "convex/react-clerk") {
            return path.resolve(__dirname, "mocks/convex-react.ts");
          }
          if (id === "@clerk/react/errors") {
            return path.resolve(__dirname, "mocks/clerk-react-errors.ts");
          }
          if (id === "@clerk/react") {
            return path.resolve(__dirname, "mocks/clerk-react.tsx");
          }
        },
      },
    ];

    return config;
  },
};
export default config;
