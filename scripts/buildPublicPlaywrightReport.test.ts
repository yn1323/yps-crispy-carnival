import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIRECTORY, "buildPublicPlaywrightReport.mjs");
const ARTIFACT_SAFETY_PATH = path.join(SCRIPT_DIRECTORY, "assertNoSensitiveArtifacts.mjs");
const HEAD_SHA = "0123456789abcdef0123456789abcdef01234567";
const SENSITIVE_EMAIL = "e2e-manager@shiftori.jp";
let testDirectory: string;
let inputPath: string;
let outputPath: string;

function playwrightReport() {
  return {
    config: { metadata: { privateValue: SENSITIVE_EMAIL } },
    suites: [
      {
        title: "deployed-smoke.test.ts",
        file: "/private/workspace/e2e/scenarios/deployed-smoke.test.ts",
        line: 1,
        column: 1,
        specs: [
          {
            title: "公開ページを表示できる <script>alert('xss')</script>",
            file: "/private/workspace/e2e/scenarios/deployed-smoke.test.ts",
            line: 10,
            column: 3,
            ok: false,
            id: "secret-test-id",
            tests: [
              {
                projectName: "chromium & mobile",
                projectId: "private-project-id",
                status: "unexpected",
                expectedStatus: "passed",
                annotations: [{ type: "secret", description: SENSITIVE_EMAIL }],
                results: [
                  {
                    status: "failed",
                    duration: 120.4,
                    retry: 0,
                    error: { message: `token=super-secret user=${SENSITIVE_EMAIL}` },
                    errors: [{ message: "password=super-secret" }],
                    stdout: ["private stdout"],
                    stderr: ["private stderr"],
                    attachments: [{ name: "trace", path: "/private/trace.zip" }],
                  },
                  {
                    status: "failed",
                    duration: 80.2,
                    retry: 1,
                    error: { message: "still-secret" },
                    errors: [],
                    stdout: [],
                    stderr: [],
                    attachments: [],
                  },
                ],
              },
            ],
          },
        ],
        suites: [
          {
            title: "nested suite",
            file: "ignored",
            line: 1,
            column: 1,
            specs: [
              {
                title: "正常に表示できる",
                ok: true,
                id: "ignored",
                file: "ignored",
                line: 1,
                column: 1,
                tests: [
                  {
                    projectName: "",
                    projectId: "ignored",
                    status: "expected",
                    results: [{ status: "passed", duration: 50, retry: 0, error: null, attachments: [] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    errors: [{ message: "global secret error" }],
    stats: { duration: 999, expected: 1, unexpected: 1, flaky: 0, skipped: 0 },
  };
}

function runBuilder(overrides: Record<string, string> = {}) {
  const values = {
    "--input": inputPath,
    "--output": outputPath,
    "--result": "failure",
    "--pull-number": "705",
    "--head-sha": HEAD_SHA,
    "--source-run-id": "29900000000",
    "--source-run-attempt": "2",
    "--actions-url": "https://github.com/yn1323/yps-crispy-carnival/actions/runs/29900000000",
    "--preview-url": "https://a1b2c3d4.dev-yps-crispy-carnival.pages.dev/",
    ...overrides,
  };
  return spawnSync(process.execPath, [SCRIPT_PATH, ...Object.entries(values).flat()], { encoding: "utf8" });
}

beforeEach(() => {
  testDirectory = mkdtempSync(path.join(tmpdir(), "public-playwright-report-"));
  inputPath = path.join(testDirectory, "test-results-deployed.json");
  outputPath = path.join(testDirectory, "public-report");
  writeFileSync(inputPath, JSON.stringify(playwrightReport()));
});

afterEach(() => {
  rmSync(testDirectory, { force: true, recursive: true });
});

describe("public Playwright report builder", () => {
  it("extracts only allowlisted result fields into a fixed schema", () => {
    const result = runBuilder();

    expect(result.status).toBe(0);
    const jsonSource = readFileSync(path.join(outputPath, "report.json"), "utf8");
    const report = JSON.parse(jsonSource);
    expect(Object.keys(report)).toEqual([
      "schemaVersion",
      "result",
      "pullRequest",
      "source",
      "previewUrl",
      "summary",
      "tests",
    ]);
    expect(report).toMatchObject({
      schemaVersion: 1,
      result: "failure",
      pullRequest: { number: 705, headSha: HEAD_SHA },
      source: {
        runId: 29900000000,
        runAttempt: 2,
        actionsUrl: "https://github.com/yn1323/yps-crispy-carnival/actions/runs/29900000000",
      },
      previewUrl: "https://a1b2c3d4.dev-yps-crispy-carnival.pages.dev/",
      summary: { total: 2, passed: 1, failed: 1, flaky: 0, skipped: 0, durationMs: 250 },
    });
    expect(report.tests).toEqual([
      {
        title: "deployed-smoke.test.ts › 公開ページを表示できる <script>alert('xss')</script>",
        project: "chromium & mobile",
        status: "unexpected",
        durationMs: 200,
        retries: 1,
      },
      {
        title: "deployed-smoke.test.ts › nested suite › 正常に表示できる",
        project: "default",
        status: "expected",
        durationMs: 50,
        retries: 0,
      },
    ]);
    expect(jsonSource).toContain("\\u003cscript\\u003e");
    expect(jsonSource).not.toContain("super-secret");
    expect(jsonSource).not.toContain("private stdout");
    expect(jsonSource).not.toContain("trace.zip");
    expect(jsonSource).not.toContain("secret-test-id");
    expect(jsonSource).not.toContain(SENSITIVE_EMAIL);

    const safetyResult = spawnSync(process.execPath, [ARTIFACT_SAFETY_PATH, "--root", path.basename(outputPath)], {
      cwd: testDirectory,
      encoding: "utf8",
    });
    expect(safetyResult.status).toBe(0);
  });

  it("escapes untrusted text in a script-free HTML report", () => {
    expect(runBuilder().status).toBe(0);

    const html = readFileSync(path.join(outputPath, "index.html"), "utf8");
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(html).toContain("chromium &amp; mobile");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("super-secret");
    expect(html).not.toContain("trace.zip");
  });

  it("generates a summary when the source test result is a failure", () => {
    const result = runBuilder({ "--result": "failure" });

    expect(result.status).toBe(0);
    expect(readFileSync(path.join(outputPath, "index.html"), "utf8")).toContain(">Failed</span>");
  });

  it("generates a successful summary only when every test passed", () => {
    const report = playwrightReport();
    report.suites[0].specs[0].tests[0].status = "expected";
    report.suites[0].specs[0].tests[0].results = [
      { ...report.suites[0].specs[0].tests[0].results[0], status: "passed", duration: 120, retry: 0 },
    ];
    writeFileSync(inputPath, JSON.stringify(report));

    const result = runBuilder({ "--result": "success" });

    expect(result.status).toBe(0);
    expect(readFileSync(path.join(outputPath, "index.html"), "utf8")).toContain(">Passed</span>");
  });

  it("rejects a successful run with no tests", () => {
    const report = playwrightReport();
    report.suites = [];
    writeFileSync(inputPath, JSON.stringify(report));

    const result = runBuilder({ "--result": "success" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("at least one passed test");
  });

  it("rejects a successful run containing a skipped test", () => {
    const report = playwrightReport();
    report.suites[0].specs[0].tests[0].status = "skipped";
    report.suites[0].specs[0].tests[0].results = [];
    writeFileSync(inputPath, JSON.stringify(report));

    const result = runBuilder({ "--result": "success" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no non-passing tests");
  });

  it.each([
    ["--pull-number", "0", "positive integer"],
    ["--source-run-id", "1.5", "positive integer"],
    ["--source-run-attempt", "9007199254740992", "supported range"],
    ["--head-sha", "main", "full lowercase Git commit SHA"],
    ["--result", "cancelled", "success or failure"],
  ])("rejects an invalid %s value", (option, value, expectedMessage) => {
    const result = runBuilder({ [option]: value });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedMessage);
  });

  it.each([
    ["--actions-url", "https://github.com/yn1323/yps-crispy-carnival/actions/runs/123", "expected GitHub repository"],
    ["--actions-url", "https://evil.example/actions/runs/29900000000", "expected GitHub repository"],
    ["--preview-url", "http://a1b2c3.dev-yps-crispy-carnival.pages.dev/", "Cloudflare Pages project"],
    ["--preview-url", "https://dev-yps-crispy-carnival.pages.dev/", "Cloudflare Pages project"],
    ["--preview-url", "https://a1b2c3.dev-yps-crispy-carnival.pages.dev/path", "Cloudflare Pages project"],
    ["--preview-url", "https://a1b2c3.dev-yps-crispy-carnival.pages.dev/?token=x", "Cloudflare Pages project"],
  ])("rejects a URL outside the allowlist", (option, value, expectedMessage) => {
    const result = runBuilder({ [option]: value });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedMessage);
  });

  it("rejects malformed Playwright JSON without exposing its contents", () => {
    const report = playwrightReport();
    report.suites[0].specs[0].tests[0].status = "malicious";
    writeFileSync(inputPath, JSON.stringify(report));

    const result = runBuilder();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid test result");
    expect(result.stderr).not.toContain("malicious");
  });
});
