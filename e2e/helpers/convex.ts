import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const moduleRequire = createRequire(import.meta.url);
const convexCliPath = join(dirname(moduleRequire.resolve("convex/package.json")), "bin", "main.js");

// pnpm が子プロセスへ渡す独自の npm_config_* は Convex CLI には不要なため、
// 子プロセスへ引き継がない。
const npmConfigKeysToOmit = new Set([
  "npm_config_manage_package_manager_versions",
  "npm_config_npm_globalconfig",
  "npm_config_verify_deps_before_run",
  "npm_config__jsr_registry",
]);

function getConvexCliEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !npmConfigKeysToOmit.has(key.toLowerCase())),
  ) as NodeJS.ProcessEnv;
}

export function convexRun(fn: string, args: Record<string, unknown> = {}): string {
  const cliArgs = ["run", "--no-push", fn];
  if (Object.keys(args).length > 0) {
    cliArgs.push(JSON.stringify(args));
  }
  if (process.env.CONVEX_PREVIEW_NAME) {
    // CI の preview deployment とローカル dev deployment を取り違えないよう、
    // Playwright 側の環境変数を Convex CLI の明示オプションへ変換する。
    cliArgs.push("--preview-name", process.env.CONVEX_PREVIEW_NAME);
  }
  // npxを経由せず、依存解決済みのCLIをNodeで直接実行する。
  // shellを使わないため、WindowsでもJSON引数を同じ形で安全に渡せる。
  return execFileSync(process.execPath, [convexCliPath, ...cliArgs], {
    encoding: "utf-8",
    cwd: process.cwd(),
    env: getConvexCliEnv(),
  });
}

export function convexRunJson<T>(fn: string, args: Record<string, unknown> = {}): T {
  return JSON.parse(convexRun(fn, args).trim()) as T;
}
