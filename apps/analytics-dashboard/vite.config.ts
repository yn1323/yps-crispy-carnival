import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { handleAnalyticsApi } from "./src/server/analyticsProxy";

type AnalyticsDevEnv = {
  convexHttpUrl?: string;
  envLabel: string;
  internalApiSecret?: string;
};

type RawAnalyticsDevEnv = {
  SHIFTORI_INTERNAL_API_SECRET?: string;
  VITE_CONVEX_SITE_URL?: string;
  VITE_CONVEX_URL?: string;
};

const dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(dirname, "../..");

function getConvexHttpUrl(convexUrl?: string) {
  if (!convexUrl) return undefined;
  try {
    const url = new URL(convexUrl);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function resolveAnalyticsDevEnv(env: RawAnalyticsDevEnv, envLabel: string): AnalyticsDevEnv {
  console.log({
    convexHttpUrl: env.VITE_CONVEX_SITE_URL ?? getConvexHttpUrl(env.VITE_CONVEX_URL),
    envLabel,
    internalApiSecret: env.SHIFTORI_INTERNAL_API_SECRET ? "[set]" : undefined,
  });
  return {
    convexHttpUrl: env.VITE_CONVEX_SITE_URL ?? getConvexHttpUrl(env.VITE_CONVEX_URL),
    envLabel,
    internalApiSecret: env.SHIFTORI_INTERNAL_API_SECRET,
  };
}

function getEnvLabel(mode: string) {
  return mode === "development" ? "local" : mode;
}

function analyticsLocalApiPlugin(env: AnalyticsDevEnv): Plugin {
  return {
    name: "analytics-local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? "/", "http://analytics.local");
        if (!requestUrl.pathname.startsWith("/api/analytics/") && requestUrl.pathname !== "/api/requests") {
          next();
          return;
        }

        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }
        const response = await handleAnalyticsApi(
          new Request(requestUrl, { method: req.method, headers }),
          {
            ANALYTICS_ENV_LABEL: env.envLabel,
            SHIFTORI_INTERNAL_API_SECRET: env.internalApiSecret,
            VITE_CONVEX_SITE_URL: env.convexHttpUrl,
          },
          env.envLabel,
        );
        res.statusCode = response.status;
        response.headers.forEach((value, name) => {
          res.setHeader(name, value);
        });
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = resolveAnalyticsDevEnv(
    {
      ...loadEnv(mode, workspaceRoot, "SHIFTORI_"),
      ...loadEnv(mode, workspaceRoot, "VITE_"),
      ...process.env,
    },
    getEnvLabel(mode),
  );

  return {
    envDir: workspaceRoot,
    plugins: [analyticsLocalApiPlugin(env), react()],
    resolve: {
      tsconfigPaths: true,
    },
    build: {
      emptyOutDir: true,
      outDir: "dist",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/recharts")) return "charts";
            if (id.includes("node_modules/@chakra-ui")) return "chakra";
            if (id.includes("node_modules/@tanstack")) return "tanstack";
            if (id.includes("node_modules")) return "vendor";
          },
        },
      },
    },
    server: {
      port: 3001,
    },
  };
});
