import { execFileSync } from "node:child_process";

const npmConfigKeysToOmit = new Set([
  "npm_config_npm_globalconfig",
  "npm_config_verify_deps_before_run",
  "npm_config__jsr_registry",
]);

function getNpxEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !npmConfigKeysToOmit.has(key.toLowerCase())),
  ) as NodeJS.ProcessEnv;
}

function toJson5(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(toJson5).join(",")}]`;
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : toJson5(k)}:${toJson5(v)}`)
      .join(",")}}`;
  }
  throw new Error(`Unsupported Convex argument value: ${String(value)}`);
}

export function convexRun(fn: string, args: Record<string, unknown> = {}): string {
  const cliArgs = ["convex", "run", "--no-push", fn];
  if (Object.keys(args).length > 0) {
    cliArgs.push(process.platform === "win32" ? toJson5(args) : JSON.stringify(args));
  }
  if (process.env.CONVEX_PREVIEW_NAME) {
    cliArgs.push("--preview-name", process.env.CONVEX_PREVIEW_NAME);
  }
  if (process.platform === "win32") {
    const psCommand = `& ${["npx", ...cliArgs].map((arg) => `'${arg.replace(/'/g, "''")}'`).join(" ")}`;
    return execFileSync("powershell.exe", ["-NoProfile", "-Command", psCommand], {
      encoding: "utf-8",
      cwd: process.cwd(),
      env: getNpxEnv(),
    });
  }
  return execFileSync("npx", cliArgs, {
    encoding: "utf-8",
    cwd: process.cwd(),
    env: getNpxEnv(),
  });
}

export function convexRunJson<T>(fn: string, args: Record<string, unknown> = {}): T {
  return JSON.parse(convexRun(fn, args).trim()) as T;
}
