import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { configDotenv } from "dotenv";
import { defineConfig, loadEnv } from "vite";
import pkg from "./package.json" with { type: "json" };
import { loadStripePublicPlanPrices } from "./scripts/loadStripePublicPlanPrices";
import { collectPublicRoutes, STATIC_404_BUILD_PATH } from "./scripts/staticSite";
import type { PublicPlanPriceCatalog } from "./src/domains/publicPricing";
import { PUBLIC_PLAN_PRICE_FIXTURE } from "./src/domains/publicPricing/fixture";
import { mdxPlugin } from "./vite/mdxPlugin";

const buildDateJst = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

export default defineConfig(async ({ mode }) => {
  const buildEnvironment = loadEnv(mode, process.cwd(), "VITE_");
  const appEnvironment = buildEnvironment.VITE_APP_ENVIRONMENT || "local";
  const releaseId = buildEnvironment.VITE_RELEASE_ID || process.env.GITHUB_SHA || "local";
  const publicPlanPrices = await resolvePublicPlanPrices(appEnvironment);

  return {
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
        // scripts/sitemap.tsが公開routeと記事frontmatterから生成し、static:validateでstaleを検出する。
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
      __APP_ENVIRONMENT__: JSON.stringify(appEnvironment),
      __APP_VERSION__: JSON.stringify(pkg.version),
      // SSG HTMLとhydration初回で、日付依存のデモ表示を同じ値に固定する。
      __BUILD_DATE_JST__: JSON.stringify(buildDateJst),
      __PUBLIC_PLAN_PRICES__: JSON.stringify(publicPlanPrices),
      __RELEASE_ID__: JSON.stringify(releaseId),
    },
  };
});

async function resolvePublicPlanPrices(appEnvironment: string): Promise<PublicPlanPriceCatalog> {
  if (appEnvironment === "storybook" || appEnvironment === "test") {
    return PUBLIC_PLAN_PRICE_FIXTURE;
  }
  if (appEnvironment === "local") {
    return await loadStripePublicPlanPrices({
      environment: appEnvironment,
      env: loadLocalStripeBuildEnvironment(),
    });
  }
  if (appEnvironment === "preview" || appEnvironment === "develop" || appEnvironment === "production") {
    return await loadStripePublicPlanPrices({
      environment: appEnvironment,
    });
  }
  throw new Error(`Unsupported VITE_APP_ENVIRONMENT for public price build: ${appEnvironment}`);
}

function loadLocalStripeBuildEnvironment(): Readonly<Record<string, string | undefined>> {
  const dotenvEnvironment: Record<string, string | undefined> = {};
  // ViteのloadEnvはdebug時に値を出すため、秘密値はログを出さないdotenvでlocal優先に読む。
  configDotenv({
    path: [".env.local", ".env"],
    processEnv: dotenvEnvironment,
    quiet: true,
  });

  return {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? dotenvEnvironment.STRIPE_SECRET_KEY,
    STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID ?? dotenvEnvironment.STRIPE_PRO_PRICE_ID,
    STRIPE_BUSINESS_PRICE_ID: process.env.STRIPE_BUSINESS_PRICE_ID ?? dotenvEnvironment.STRIPE_BUSINESS_PRICE_ID,
  };
}
