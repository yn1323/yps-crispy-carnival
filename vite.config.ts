import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };
import { collectPublicRoutes, STATIC_404_BUILD_PATH } from "./scripts/staticSite";
import { mdxPlugin } from "./vite/mdxPlugin";

const buildDateJst = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

export default defineConfig({
  plugins: [
    mdxPlugin(),
    tanstackStart({
      router: {
        routeFileIgnorePattern: "\\.test\\.[jt]sx?$",
      },
      spa: {
        enabled: true,
        // Start 1.168では公開rootのprerenderとmaskPath "/" が競合するため、CSR routeをmaskに使う。
        maskPath: "/login",
        prerender: {
          outputPath: "/_shell",
          crawlLinks: false,
        },
      },
      prerender: {
        enabled: true,
        autoSubfolderIndex: false,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
      },
      pages: [
        ...collectPublicRoutes().map((path) => ({ path })),
        {
          path: STATIC_404_BUILD_PATH,
          prerender: { enabled: true, outputPath: "/404", autoSubfolderIndex: false },
        },
      ],
      // lastmod/changefreqを含む既存のpublic/sitemap.xmlを正とする。
      sitemap: { enabled: false },
    }),
    viteReact({ include: /\.(js|jsx|mdx|ts|tsx)$/ }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    allowedHosts: [".ngrok.app", ".ngrok-free.app"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // SSG HTMLとhydration初回で、日付依存のデモ表示を同じ値に固定する。
    __BUILD_DATE_JST__: JSON.stringify(buildDateJst),
  },
});
