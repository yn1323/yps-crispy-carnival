import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIRECTORY, "buildPlaywrightPublicInput.mjs");
const REPORT_BUILDER_PATH = path.join(SCRIPT_DIRECTORY, "buildPublicPlaywrightReport.mjs");
const PRIVACY_GATE_PATH = path.join(SCRIPT_DIRECTORY, "assertNoSensitiveArtifacts.mjs");
const HEAD_SHA = "0123456789abcdef0123456789abcdef01234567";
const PRIVATE_EMAIL = "manager@shiftori.invalid";
let testDirectory: string;
let inputPath: string;
let outputPath: string;

function rawReport() {
  return {
    config: { metadata: { email: PRIVATE_EMAIL, secret: "private-metadata" } },
    suites: [
      {
        title: `release.test.ts ${PRIVATE_EMAIL}`,
        file: "/private/workspace/release.test.ts",
        specs: [
          {
            title: "送信できる <script>alert(1)</script>",
            file: "/private/workspace/release.test.ts",
            tests: [
              {
                projectName: "desktop-chrome",
                projectId: "private-project-id",
                status: "unexpected",
                annotations: [{ type: "private", description: PRIVATE_EMAIL }],
                results: [
                  {
                    status: "failed",
                    duration: 123.6,
                    retry: 0,
                    error: { message: `password=private user=${PRIVATE_EMAIL}` },
                    stdout: ["private stdout"],
                    attachments: [{ name: "trace", path: "/private/trace.zip" }],
                  },
                ],
              },
            ],
          },
        ],
        suites: [],
      },
    ],
    errors: [{ message: `global error ${PRIVATE_EMAIL}` }],
  };
}

function runProjector(overrides: Record<string, string> = {}) {
  const values = { "--input": inputPath, "--output": outputPath, ...overrides };
  return spawnSync(process.execPath, [SCRIPT_PATH, ...Object.entries(values).flat()], { encoding: "utf8" });
}

beforeEach(() => {
  testDirectory = mkdtempSync(path.join(tmpdir(), "playwright-public-input-"));
  inputPath = path.join(testDirectory, "raw-results.json");
  outputPath = path.join(testDirectory, "public-input", "test-results.json");
  writeFileSync(inputPath, JSON.stringify(rawReport()));
});

afterEach(() => {
  rmSync(testDirectory, { force: true, recursive: true });
});

describe("Playwright public input builder", () => {
  it("projects only publisher-compatible allowlisted fields and redacts email identifiers", () => {
    const result = runProjector();

    expect(result.status).toBe(0);
    const outputSource = readFileSync(outputPath, "utf8");
    expect(JSON.parse(outputSource)).toEqual({
      suites: [
        {
          title: "release.test.ts [redacted-email]",
          specs: [
            {
              title: "送信できる <script>alert(1)</script>",
              tests: [
                {
                  projectName: "desktop-chrome",
                  status: "unexpected",
                  results: [{ duration: 124, retry: 0 }],
                },
              ],
            },
          ],
          suites: [],
        },
      ],
    });
    expect(outputSource).toContain("\\u003cscript\\u003e");
    expect(outputSource).not.toContain(PRIVATE_EMAIL);
    expect(outputSource).not.toContain("private-metadata");
    expect(outputSource).not.toContain("private stdout");
    expect(outputSource).not.toContain("trace.zip");

    const privacyResult = spawnSync(
      process.execPath,
      [PRIVACY_GATE_PATH, "--root", path.relative(testDirectory, outputPath)],
      { cwd: testDirectory, encoding: "utf8" },
    );
    expect(privacyResult.stderr).toBe("");
    expect(privacyResult.status).toBe(0);
  });

  it("keeps the fixed input compatible with the trusted public report builder", () => {
    expect(runProjector().status).toBe(0);
    const reportOutput = path.join(testDirectory, "report");
    const result = spawnSync(
      process.execPath,
      [
        REPORT_BUILDER_PATH,
        "--input",
        outputPath,
        "--output",
        reportOutput,
        "--result",
        "failure",
        "--pull-number",
        "717",
        "--head-sha",
        HEAD_SHA,
        "--source-run-id",
        "29900000000",
        "--source-run-attempt",
        "1",
        "--actions-url",
        "https://github.com/yn1323/yps-crispy-carnival/actions/runs/29900000000",
        "--preview-url",
        "https://a1b2c3d4.dev-yps-crispy-carnival.pages.dev/",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(path.join(reportOutput, "report.json"), "utf8"))).toMatchObject({
      summary: { total: 1, failed: 1, durationMs: 124 },
      tests: [{ title: "release.test.ts [redacted-email] › 送信できる <script>alert(1)</script>" }],
    });
  });

  it.each([
    [{ errors: [] }, "suites array"],
    [
      { suites: [{ title: "suite", specs: [{ title: "spec", tests: [{ status: "unknown", results: [] }] }] }] },
      "invalid test result",
    ],
    [
      {
        suites: [
          {
            title: "suite",
            specs: [
              {
                title: "spec",
                tests: [{ projectName: "desktop", status: "expected", results: [{ duration: -1, retry: 0 }] }],
              },
            ],
          },
        ],
      },
      "invalid test duration",
    ],
  ])("rejects malformed source data without publishing a partial result", (source, expectedMessage) => {
    writeFileSync(inputPath, JSON.stringify(source));

    const result = runProjector();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedMessage);
    expect(() => readFileSync(outputPath)).toThrow();
  });

  it("rejects a symbolic-link input", () => {
    const linkedInput = path.join(testDirectory, "linked-results.json");
    symlinkSync(inputPath, linkedInput);

    const result = runProjector({ "--input": linkedInput });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not a symbolic link");
  });

  it("does not overwrite a previously generated public input", () => {
    expect(runProjector().status).toBe(0);
    const original = readFileSync(outputPath, "utf8");
    writeFileSync(inputPath, JSON.stringify({ suites: [] }));

    expect(runProjector().status).toBe(1);
    expect(readFileSync(outputPath, "utf8")).toBe(original);
  });
});
