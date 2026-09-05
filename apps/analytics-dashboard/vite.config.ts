import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { ANALYTICS_DASHBOARD_MAX_BODY_BYTES } from "../../convex/analyticsDashboard/schemas";
import { handleAnalyticsApi, jsonResponse } from "./src/server/analyticsProxy";

type AnalyticsDevEnv = {
  convexHttpUrl?: string;
  envLabel: string;
  internalApiSecret?: string;
};

type RawAnalyticsDevEnv = {
  ANALYTICS_ENV_LABEL?: string;
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
  return {
    convexHttpUrl: env.VITE_CONVEX_SITE_URL ?? getConvexHttpUrl(env.VITE_CONVEX_URL),
    envLabel,
    internalApiSecret: env.SHIFTORI_INTERNAL_API_SECRET,
  };
}

function getEnvLabel(mode: string, env: RawAnalyticsDevEnv) {
  const explicitLabel = env.ANALYTICS_ENV_LABEL?.trim();
  if (explicitLabel) return explicitLabel;
  if (mode !== "development") return mode;

  const convexUrl = env.VITE_CONVEX_SITE_URL ?? env.VITE_CONVEX_URL;
  if (!convexUrl) return "development";
  try {
    const { hostname } = new URL(convexUrl);
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return "local";
    const deployment = hostname.match(/^([^.]+)\.convex\.(?:cloud|site)$/)?.[1];
    return deployment ? `development:${deployment}` : "development";
  } catch {
    return "development";
  }
}

function analyticsLocalApiPlugin(env: AnalyticsDevEnv): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    // Origin判定にはブラウザが開いている実際のhostを使う。
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost:3001"}`);
    if (
      !requestUrl.pathname.startsWith("/api/analytics/") &&
      requestUrl.pathname !== "/api/requests" &&
      requestUrl.pathname !== "/api/requests/update"
    ) {
      next();
      return;
    }
    const send = async (response: Response) => {
      res.statusCode = response.status;
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    };
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        else if (value !== undefined) headers.set(name, value);
      }
      let body: Buffer | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.byteLength;
          if (bytes > ANALYTICS_DASHBOARD_MAX_BODY_BYTES) {
            await send(jsonResponse({ error: { message: "送信内容が大きすぎます" } }, { status: 413 }));
            return;
          }
          chunks.push(buffer);
        }
        body = Buffer.concat(chunks);
      }
      await send(
        await handleAnalyticsApi(
          new Request(requestUrl, {
            method: req.method,
            headers,
            body: body === undefined ? undefined : new Uint8Array(body),
          }),
          {
            ANALYTICS_ENV_LABEL: env.envLabel,
            SHIFTORI_INTERNAL_API_SECRET: env.internalApiSecret,
            VITE_CONVEX_SITE_URL: env.convexHttpUrl,
          },
          env.envLabel,
        ),
      );
    } catch {
      await send(jsonResponse({ error: { message: "リクエストを読み取れませんでした" } }, { status: 400 }));
    }
  };
  return {
    name: "analytics-local-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const rawEnv = {
    ...loadEnv(mode, workspaceRoot, "ANALYTICS_"),
    ...loadEnv(mode, workspaceRoot, "SHIFTORI_"),
    ...loadEnv(mode, workspaceRoot, "VITE_"),
    ...process.env,
  };
  const env = resolveAnalyticsDevEnv(rawEnv, getEnvLabel(mode, rawEnv));

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
