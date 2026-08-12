import { describe, expect, it } from "vitest";
import { assertDeployedSmokeResults, EXPECTED_DEPLOYED_SMOKE_CONTRACTS } from "./assertDeployedSmokeResults.mjs";

type ResultOverride = {
  projectName?: string;
  results?: ReadonlyArray<{ duration: number; status: string }>;
  status?: string;
};

function report(overrides: Record<string, ResultOverride> = {}) {
  return {
    stats: {
      expected: EXPECTED_DEPLOYED_SMOKE_CONTRACTS.size,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
    suites: [
      {
        title: "deployed smoke",
        specs: [...EXPECTED_DEPLOYED_SMOKE_CONTRACTS].map(([contractId, projectName]) => ({
          title: `[${contractId}] representative deployed boundary`,
          tests: [
            {
              projectName,
              status: "expected",
              results: [{ duration: 100, status: "passed" }],
              ...overrides[contractId],
            },
          ],
        })),
      },
    ],
  };
}

describe("Deployed smoke result gate", () => {
  it("HTTPとbrowser契約を正しいprojectで各1回、初回成功として検証する", () => {
    expect(assertDeployedSmokeResults(report())).toEqual(
      [...EXPECTED_DEPLOYED_SMOKE_CONTRACTS].map(([contractId, projectName]) => ({
        contractId,
        projectName,
        status: "expected",
        retries: 0,
        durationMs: 100,
      })),
    );
  });

  it.each([
    ["skip", { status: "skipped", results: [{ duration: 0, status: "skipped" }] }, "must be expected"],
    [
      "retry",
      {
        results: [
          { duration: 10, status: "failed" },
          { duration: 20, status: "passed" },
        ],
      },
      "first attempt",
    ],
    ["passed以外", { results: [{ duration: 10, status: "failed" }] }, "one passed result"],
    ["誤ったproject", { projectName: "wrong-project" }, "deployed-chromium"],
  ] as const)("%sを拒否する", (_label, override, expectedMessage) => {
    expect(() => assertDeployedSmokeResults(report({ "DEPLOY-SMOKE-HTTP-01": override }))).toThrow(expectedMessage);
  });

  it("必須契約の欠落を拒否する", () => {
    const missing = report();
    missing.suites[0].specs = missing.suites[0].specs.filter((spec) => !spec.title.includes("DEPLOY-SMOKE-BROWSER-01"));
    missing.stats.expected = 1;

    expect(() => assertDeployedSmokeResults(missing)).toThrow("DEPLOY-SMOKE-BROWSER-01 must run exactly once");
  });

  it("同じ契約の重複実行を拒否する", () => {
    const duplicate = report();
    duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
    duplicate.stats.expected = 3;

    expect(() => assertDeployedSmokeResults(duplicate)).toThrow("DEPLOY-SMOKE-HTTP-01 must run exactly once");
  });

  it("未知の契約IDを拒否する", () => {
    const unknown = report();
    unknown.suites[0].specs.push({
      title: "[DEPLOY-SMOKE-UNKNOWN-01] unknown deployed boundary",
      tests: [
        {
          projectName: "deployed-chromium",
          status: "expected",
          results: [{ duration: 100, status: "passed" }],
        },
      ],
    });
    unknown.stats.expected = 3;

    expect(() => assertDeployedSmokeResults(unknown)).toThrow("unknown deployed smoke contracts");
  });

  it("契約IDなしのtestを拒否する", () => {
    const untracked = report();
    untracked.suites[0].specs.push({
      title: "untagged deployed boundary",
      tests: [
        {
          projectName: "deployed-chromium",
          status: "expected",
          results: [{ duration: 100, status: "passed" }],
        },
      ],
    });

    expect(() => assertDeployedSmokeResults(untracked)).toThrow("must declare exactly one deployed smoke contract");
  });

  it("report集計上のskip、unexpected、flakeを拒否する", () => {
    for (const field of ["skipped", "unexpected", "flaky"] as const) {
      const invalid = report();
      invalid.stats[field] = 1;
      expect(() => assertDeployedSmokeResults(invalid)).toThrow(`stats.${field} must be 0`);
    }
  });
});
