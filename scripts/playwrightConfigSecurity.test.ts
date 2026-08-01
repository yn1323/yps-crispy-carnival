import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const PLAYWRIGHT_CLI_PATH = path.join(REPOSITORY_ROOT, "node_modules", "@playwright", "test", "cli.js");
const SECRET_SENTINELS = {
  E2E_CLERK_PASSWORD: "e2e-password-must-not-reach-report",
  CLERK_SECRET_KEY: "clerk-secret-must-not-reach-report",
  CONVEX_DEPLOY_KEY: "convex-key-must-not-reach-report",
} as const;
const USER_SENTINELS = [
  "report-user-1@example.com",
  "report-user-2@example.com",
  "report-user-3@example.com",
  "report-user-4@example.com",
  "report-user-5@example.com",
  "report-user-6@example.com",
] as const;

type PlaywrightListReport = {
  config?: {
    webServer?: Record<string, unknown>;
  };
};

describe("Playwright config artifact security", () => {
  it("does not serialize inherited credentials into the JSON report", () => {
    const isolatedDirectory = mkdtempSync(path.join(tmpdir(), "playwright-config-security-"));
    const inheritedRuntimeEnv = Object.fromEntries(
      ["PATH", "TMPDIR", "TMP", "TEMP", "SystemRoot"].flatMap((key) =>
        process.env[key] ? [[key, process.env[key]]] : [],
      ),
    );
    const result = spawnSync(
      process.execPath,
      [
        PLAYWRIGHT_CLI_PATH,
        "test",
        "--config",
        path.join(REPOSITORY_ROOT, "playwright.config.ts"),
        "--list",
        "--reporter=json",
      ],
      {
        cwd: isolatedDirectory,
        encoding: "utf8",
        env: {
          ...inheritedRuntimeEnv,
          ...SECRET_SENTINELS,
          E2E_CLERK_USERS: USER_SENTINELS.join(","),
        },
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    rmSync(isolatedDirectory, { recursive: true, force: true });

    expect(result.status, "Playwright test listing should succeed").toBe(0);

    const report = JSON.parse(result.stdout) as PlaywrightListReport;
    const webServer = report.config?.webServer ?? {};
    expect(Object.keys(webServer).length > 0).toBe(true);
    expect(Object.hasOwn(webServer, "env")).toBe(false);
    for (const sentinel of [...Object.values(SECRET_SENTINELS), USER_SENTINELS.join(","), ...USER_SENTINELS]) {
      expect(result.stdout.includes(sentinel)).toBe(false);
    }
  });
});
