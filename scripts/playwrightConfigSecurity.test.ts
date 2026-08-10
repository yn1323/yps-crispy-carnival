import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import E2EPrivacyReporter from "../e2e/reporters/privacyReporter";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const PLAYWRIGHT_CLI_PATH = path.join(REPOSITORY_ROOT, "node_modules", "@playwright", "test", "cli.js");
const PLAYWRIGHT_CONFIG_PATHS = [
  "playwright.config.ts",
  "playwright.a11y.config.ts",
  "playwright.deployed.config.ts",
] as const;
const AUTH_SETUP_PATH = path.join(REPOSITORY_ROOT, "e2e", "fixtures", "auth.setup.ts");
const DEPLOYED_SMOKE_PATH = path.join(REPOSITORY_ROOT, "e2e", "scenarios", "deployed-smoke.test.ts");
const PLAYWRIGHT_WORKFLOW_PATH = path.join(REPOSITORY_ROOT, ".github", "workflows", "playwright.yml");
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
    metadata?: Record<string, unknown>;
    webServer?: Record<string, unknown>;
  };
};

describe("Playwright config artifact security", () => {
  it("CIはE2E identityとpasswordをGitHub Secretsからだけ受け取る", () => {
    const workflow = readFileSync(PLAYWRIGHT_WORKFLOW_PATH, "utf8");

    expect(workflow).not.toContain("vars.E2E_CLERK_USERS");
    expect(workflow).not.toContain("vars.E2E_CLERK_PASSWORD");
    expect(workflow.match(/secrets\.E2E_CLERK_USERS/g)).toHaveLength(4);
    expect(workflow.match(/secrets\.E2E_CLERK_PASSWORD/g)).toHaveLength(4);
    expect(workflow).toContain('PLAYWRIGHT_NO_COPY_PROMPT: "1"');
  });

  it("標準reporterより先にstepとtestの失敗情報をredactする", () => {
    const reporter = new E2EPrivacyReporter();
    const stepError = {
      message: "locator contained report-user-1@example.com",
      errorContext: '- textbox "report-user-1@example.com"',
    };
    const resultError = { stack: "authorization:BearerValue" };

    reporter.onStepEnd({} as never, {} as never, { error: stepError } as never);
    reporter.onTestEnd({} as never, { errors: [resultError] } as never);

    expect(stepError).not.toHaveProperty("errorContext");
    expect(stepError.message).toBe("locator contained [email-redacted]");
    expect(resultError.stack).toBe("authorization=[redacted]");
    for (const relativeConfigPath of PLAYWRIGHT_CONFIG_PATHS) {
      const config = readFileSync(path.join(REPOSITORY_ROOT, relativeConfigPath), "utf8");
      const privacyReporterIndex = config.indexOf('"./e2e/reporters/privacyReporter.ts"');
      expect(privacyReporterIndex, relativeConfigPath).toBeGreaterThanOrEqual(0);
      expect(privacyReporterIndex, relativeConfigPath).toBeLessThan(config.indexOf('["list"'));
    }
    expect(readFileSync(AUTH_SETUP_PATH, "utf8")).toContain("artifactSafeTest as setup");
    expect(readFileSync(DEPLOYED_SMOKE_PATH, "utf8")).toContain("artifactSafeTest as test");
  });

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
    expect(JSON.stringify(report.config?.metadata ?? {})).not.toMatch(/git(?:Diff|Commit)/i);
    for (const sentinel of [...Object.values(SECRET_SENTINELS), USER_SENTINELS.join(","), ...USER_SENTINELS]) {
      expect(result.stdout.includes(sentinel)).toBe(false);
    }
  });

  it("実際のmatcher失敗でも標準reportとerror-contextへ資格情報を残さない", () => {
    const isolatedDirectory = mkdtempSync(path.join(tmpdir(), "playwright-privacy-failure-"));
    const testDirectory = path.join(isolatedDirectory, "tests");
    const outputDirectory = path.join(isolatedDirectory, "artifacts");
    const reportPath = path.join(isolatedDirectory, "report.json");
    const configPath = path.join(isolatedDirectory, "playwright.config.cjs");
    const passwordSentinel = SECRET_SENTINELS.E2E_CLERK_PASSWORD;
    const userSentinel = USER_SENTINELS[0];
    mkdirSync(testDirectory);
    writeFileSync(path.join(isolatedDirectory, "package.json"), '{"type":"module"}\n');
    writeFileSync(
      configPath,
      `const { defineConfig } = require(${JSON.stringify(path.join(REPOSITORY_ROOT, "node_modules", "@playwright", "test"))});
module.exports = defineConfig({
  testDir: ${JSON.stringify(testDirectory)},
  outputDir: ${JSON.stringify(outputDirectory)},
  reporter: [
    [${JSON.stringify(path.join(REPOSITORY_ROOT, "e2e", "reporters", "privacyReporter.ts"))}],
    ["list"],
    ["json", { outputFile: ${JSON.stringify(reportPath)} }],
  ],
});
`,
    );
    writeFileSync(
      path.join(testDirectory, "privacy.test.ts"),
      `import { artifactSafeTest as test, expect } from ${JSON.stringify(path.join(REPOSITORY_ROOT, "e2e", "fixtures", "artifactSafeTest.ts"))};
test("privacy failure", () => {
  expect(process.env.E2E_CLERK_PASSWORD).toBe(process.env.E2E_CLERK_USERS);
});
`,
    );

    let serializedOutput = "";
    try {
      const result = spawnSync(process.execPath, [PLAYWRIGHT_CLI_PATH, "test", "--config", configPath], {
        cwd: isolatedDirectory,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          E2E_CLERK_PASSWORD: passwordSentinel,
          E2E_CLERK_USERS: userSentinel,
          FORCE_COLOR: "1",
          PLAYWRIGHT_NO_COPY_PROMPT: "1",
        },
        maxBuffer: 20 * 1024 * 1024,
      });
      expect(result.status, "Playwright matcher should fail for the privacy contract").toBe(1);
      const artifactText = readdirSync(outputDirectory, { recursive: true, encoding: "utf8" })
        .filter((relativePath) => relativePath.endsWith(".md"))
        .map((relativePath) => readFileSync(path.join(outputDirectory, relativePath), "utf8"))
        .join("\n");
      serializedOutput = `${result.stdout}\n${result.stderr}\n${readFileSync(reportPath, "utf8")}\n${artifactText}`;
    } finally {
      rmSync(isolatedDirectory, { recursive: true, force: true });
    }

    expect(serializedOutput).toContain("[configured-value-redacted]");
    expect(serializedOutput).toContain("[email-redacted]");
    expect(serializedOutput).not.toContain(passwordSentinel);
    expect(serializedOutput).not.toContain(userSentinel);
  });
});
