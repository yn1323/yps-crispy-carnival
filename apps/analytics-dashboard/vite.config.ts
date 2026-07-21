import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

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

type JsonResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (chunk: string) => void;
};

const dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(dirname, "../..");

function getConvexEndpoint(baseUrl: string) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("analytics-dashboard/query", normalized).toString();
}

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

function getConvexHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return null;
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

function sendJson(res: JsonResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function readRequestBody(req: NodeJS.ReadableStream) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function analyticsLocalApiPlugin(env: AnalyticsDevEnv): Plugin {
  return {
    name: "analytics-local-api",
    configureServer(server) {
      server.middlewares.use("/api/analytics", async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: { message: "POSTでリクエストしてください" } });
          return;
        }
        if (!env.convexHttpUrl || !env.internalApiSecret) {
          sendJson(res, 503, { error: { message: "分析データの接続先が設定されていません" } });
          return;
        }

        const body = await readRequestBody(req);
        const upstream = await fetch(getConvexEndpoint(env.convexHttpUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-shiftori-internal-api-secret": env.internalApiSecret,
          },
          body,
        });

        const responseText = await upstream.text();
        if (!upstream.ok) {
          const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
          sendJson(res, status, { error: { message: "分析データを読み込めませんでした" } });
          return;
        }

        try {
          sendJson(res, 200, {
            env: {
              label: env.envLabel,
              convexHost: getConvexHost(env.convexHttpUrl),
            },
            data: JSON.parse(responseText) as unknown,
          });
        } catch {
          sendJson(res, 502, { error: { message: "分析データの形式が正しくありません" } });
        }
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
