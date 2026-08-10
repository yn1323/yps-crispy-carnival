import { describe, expect, it } from "vitest";
import { assertE2EA11yResults, EXPECTED_A11Y_CONTRACT } from "./assertE2EA11yResults.mjs";

function report(override: { contractId?: string; projectName?: string; status?: string; results?: unknown[] } = {}) {
  return {
    suites: [
      {
        title: "a11y",
        specs: [
          {
            title: `[${override.contractId ?? EXPECTED_A11Y_CONTRACT.contractId}] representative accessibility boundary`,
            tests: [
              {
                projectName: override.projectName ?? EXPECTED_A11Y_CONTRACT.projectName,
                status: override.status ?? "expected",
                results: override.results ?? [{ duration: 100 }],
              },
            ],
          },
          {
            title: "prepare authenticated state",
            tests: [{ projectName: "setup", status: "expected", results: [{ duration: 100 }] }],
          },
        ],
      },
    ],
  };
}

describe("E2E a11y result gate", () => {
  it("契約ID、project、初回成功を検証する", () => {
    expect(assertE2EA11yResults(report())).toEqual({
      contractId: "E2E-A11Y-01",
      projectName: "a11y-chromium",
      status: "expected",
      retries: 0,
      durationMs: 100,
    });
  });

  it.each([
    ["skip", { status: "skipped" }, "must be expected"],
    ["retry", { results: [{ duration: 10 }, { duration: 20 }] }, "first attempt"],
    ["wrong project", { projectName: "desktop-chromium" }, "must run in a11y-chromium"],
    ["unknown contract", { contractId: "E2E-UNKNOWN-01" }, "must run exactly once"],
  ])("%sを拒否する", (_label, override, expectedMessage) => {
    expect(() => assertE2EA11yResults(report(override))).toThrow(expectedMessage);
  });

  it("余分なscenarioを拒否する", () => {
    const duplicated = report();
    duplicated.suites[0].specs.push({
      title: "[E2E-A11Y-01] duplicate accessibility boundary",
      tests: [{ projectName: "a11y-chromium", status: "expected", results: [{ duration: 100 }] }],
    });

    expect(() => assertE2EA11yResults(duplicated)).toThrow("must run exactly one scenario");
  });
});
