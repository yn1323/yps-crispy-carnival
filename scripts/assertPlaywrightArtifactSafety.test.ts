import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const GATE_SCRIPT_PATH = path.join(SCRIPT_DIRECTORY, "assertPlaywrightArtifactSafety.mjs");
const CREDENTIALS = {
  E2E_CLERK_USERS: "artifact-user-1@example.com,artifact-user-2@example.com",
  E2E_CLERK_PASSWORD: "artifact-password-sentinel",
  CLERK_SECRET_KEY: "artifact-clerk-secret-sentinel",
  CONVEX_DEPLOY_KEY: "artifact-convex-key-sentinel",
} as const;

let testDirectory: string;

beforeEach(() => {
  testDirectory = mkdtempSync(path.join(tmpdir(), "playwright-artifact-safety-"));
  mkdirSync(path.join(testDirectory, "playwright-report"));
  writeFileSync(path.join(testDirectory, "test-results.json"), '{"suites":[]}');
  writeFileSync(path.join(testDirectory, "playwright-report", "index.html"), "<html>safe</html>");
});

afterEach(() => {
  rmSync(testDirectory, { recursive: true, force: true });
});

function runGate(env: NodeJS.ProcessEnv = CREDENTIALS) {
  return spawnSync(process.execPath, [GATE_SCRIPT_PATH], {
    cwd: testDirectory,
    encoding: "utf8",
    env,
  });
}

describe("Playwright artifact safety gate", () => {
  it("accepts artifacts without configured credentials", () => {
    const result = runGate();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("2 files checked");
  });

  it.each(Object.entries(CREDENTIALS))("rejects configured credential %s without echoing its value", (name, value) => {
    writeFileSync(path.join(testDirectory, "test-results.json"), value);

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(name);
    expect(result.stderr.includes(value)).toBe(false);
  });

  it("rejects an individual E2E user identifier", () => {
    const firstUser = CREDENTIALS.E2E_CLERK_USERS.split(",")[0];
    writeFileSync(path.join(testDirectory, "playwright-report", "index.html"), firstUser);

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("E2E_CLERK_USERS[0]");
    expect(result.stderr.includes(firstUser)).toBe(false);
  });

  it("rejects a JSON-escaped credential without echoing its value", () => {
    const escapedPassword = 'quote"slash\\newline\nsecret';
    writeFileSync(path.join(testDirectory, "test-results.json"), JSON.stringify({ value: escapedPassword }));

    const result = runGate({ ...CREDENTIALS, E2E_CLERK_PASSWORD: escapedPassword });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("E2E_CLERK_PASSWORD");
    expect(result.stderr.includes(escapedPassword)).toBe(false);
  });

  it("fails closed when an artifact contains a symbolic link", () => {
    symlinkSync(
      path.join(testDirectory, "test-results.json"),
      path.join(testDirectory, "playwright-report", "report-link.json"),
    );

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not accept symbolic links");
  });

  it("fails closed when artifact paths contain no files", () => {
    rmSync(path.join(testDirectory, "test-results.json"));
    mkdirSync(path.join(testDirectory, "test-results.json"));
    rmSync(path.join(testDirectory, "playwright-report", "index.html"));

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no artifact files");
  });

  it("fails closed when a required credential is unavailable", () => {
    const { CONVEX_DEPLOY_KEY: _, ...incompleteCredentials } = CREDENTIALS;

    const result = runGate(incompleteCredentials);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CONVEX_DEPLOY_KEY");
  });
});
