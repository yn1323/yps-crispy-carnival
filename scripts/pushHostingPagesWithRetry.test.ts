import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIRECTORY, "pushHostingPagesWithRetry.sh");
let testDirectory: string;
let binDirectory: string;
let logPath: string;
let countPath: string;

beforeEach(() => {
  testDirectory = mkdtempSync(path.join(tmpdir(), "hosting-pages-push-"));
  binDirectory = path.join(testDirectory, "bin");
  logPath = path.join(testDirectory, "git.log");
  countPath = path.join(testDirectory, "push-count");
  mkdirSync(binDirectory);
  const gitPath = path.join(binDirectory, "git");
  writeFileSync(
    gitPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_GIT_LOG"
if [ "\${1:-}" = "push" ]; then
  count=0
  if [ -f "$MOCK_GIT_COUNT" ]; then
    read -r count < "$MOCK_GIT_COUNT"
  fi
  count=$((count + 1))
  printf '%s\n' "$count" > "$MOCK_GIT_COUNT"
  if [ "$MOCK_GIT_MODE" = "always-fail" ] || [ "$count" -eq 1 ]; then
    exit 1
  fi
fi
`,
  );
  chmodSync(gitPath, 0o755);
});

afterEach(() => {
  rmSync(testDirectory, { force: true, recursive: true });
});

function runPush(mode: "fail-once" | "always-fail", maxAttempts = "5") {
  return spawnSync("bash", [SCRIPT_PATH], {
    cwd: testDirectory,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
      MOCK_GIT_LOG: logPath,
      MOCK_GIT_COUNT: countPath,
      MOCK_GIT_MODE: mode,
      HOSTING_PAGES_PUSH_MAX_ATTEMPTS: maxAttempts,
      HOSTING_PAGES_PUSH_RETRY_DELAY_SECONDS: "0",
    },
  });
}

describe("hosting-pages push retry", () => {
  it("rebases and retries after a non-fast-forward-style push failure", () => {
    const result = runPush("fail-once");

    expect(result.status).toBe(0);
    expect(readFileSync(logPath, "utf8").trim().split("\n")).toEqual([
      "pull --rebase origin main",
      "push origin HEAD:main",
      "pull --rebase origin main",
      "push origin HEAD:main",
    ]);
  });

  it("fails closed after the configured attempt limit", () => {
    const result = runPush("always-fail", "3");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("hosting-pages push failed after 3 attempts");
    expect(readFileSync(countPath, "utf8").trim()).toBe("3");
  });
});
