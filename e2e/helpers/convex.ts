import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const moduleRequire = createRequire(import.meta.url);
const convexCliPath = join(dirname(moduleRequire.resolve("convex/package.json")), "bin", "main.js");
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

import { recordE2EMetric } from "./metrics";

type ConvexCommandExecutor = (
  file: string,
  args: string[],
  options: { cwd: string; encoding: "utf-8"; env: NodeJS.ProcessEnv; timeout: number },
) => string;

type ConvexRunOptions = {
  timeoutMs?: number;
  executor?: ConvexCommandExecutor;
};

type E2EConvexCommandFailureKind = "exit" | "invalid-json" | "occ" | "timeout";

export class E2EConvexCommandError extends Error {
  readonly kind: E2EConvexCommandFailureKind;

  constructor(fn: string, kind: E2EConvexCommandFailureKind, fingerprint: string) {
    super(`E2E Convex command failed: ${fn} (${kind}, ${fingerprint})`);
    this.name = "E2EConvexCommandError";
    this.kind = kind;
  }
}

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

export function convexRun(fn: string, args: Record<string, unknown> = {}, options: ConvexRunOptions = {}): string {
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Convex command timeout must be positive.");
  const executor = options.executor ?? (execFileSync as ConvexCommandExecutor);
  recordE2EMetric("cliCalls");
  try {
    return executor(process.execPath, [convexCliPath, ...cliArgs], {
      encoding: "utf-8",
      cwd: process.cwd(),
      env: getConvexCliEnv(),
      timeout: Math.ceil(timeoutMs),
    });
  } catch (error) {
    const details = getCommandFailureDetails(error);
    throw new E2EConvexCommandError(sanitizeFunctionName(fn), details.kind, details.fingerprint);
  }
}

export function convexRunJson<T>(fn: string, args: Record<string, unknown> = {}, options: ConvexRunOptions = {}): T {
  const output = convexRun(fn, args, options).trim();
  try {
    return JSON.parse(output) as T;
  } catch {
    throw new E2EConvexCommandError(sanitizeFunctionName(fn), "invalid-json", fingerprint(output));
  }
}

function getCommandFailureDetails(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; stderr?: unknown; signal?: unknown };
  const rawDetails = [candidate?.code, candidate?.signal, candidate?.message, candidate?.stderr]
    .map((value) => String(value ?? ""))
    .join("\n");
  const kind = /ETIMEDOUT|SIGTERM/i.test(rawDetails)
    ? "timeout"
    : /OptimisticConcurrencyControlFailure/.test(rawDetails)
      ? "occ"
      : "exit";
  return { kind, fingerprint: fingerprint(rawDetails) } as const;
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function sanitizeFunctionName(fn: string) {
  return /^[A-Za-z0-9_./:-]+$/.test(fn) ? fn : "unknown-function";
}
