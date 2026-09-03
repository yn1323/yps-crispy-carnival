import { describe, expect, it } from "vitest";
import { assertMeasurementResults, EXPECTED_MEASUREMENT_CONTRACTS } from "./assertMeasurementResults.mjs";

function report() {
  return {
    stats: {
      expected: EXPECTED_MEASUREMENT_CONTRACTS.size,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
    suites: [
      {
        title: "measurement browser contract",
        specs: [...EXPECTED_MEASUREMENT_CONTRACTS].map(([contractId, projectName]) => ({
          title: `[${contractId}] always-on measurement`,
          tests: [
            {
              projectName,
              status: "expected",
              results: [{ duration: 100, status: "passed" }],
            },
          ],
        })),
      },
    ],
  };
}

describe("Measurement browser result gate", () => {
  it("2契約を専用projectで各1回、初回成功として検証する", () => {
    expect(assertMeasurementResults(report())).toEqual(
      [...EXPECTED_MEASUREMENT_CONTRACTS].map(([contractId, projectName]) => ({
        contractId,
        projectName,
        status: "expected",
        retries: 0,
        durationMs: 100,
      })),
    );
  });

  it("必須契約のskipを拒否する", () => {
    const invalid = report();
    invalid.suites[0].specs[0].tests[0] = {
      projectName: "measurement-enabled-chromium",
      status: "skipped",
      results: [{ duration: 0, status: "skipped" }],
    };
    invalid.stats.expected = 1;
    invalid.stats.skipped = 1;

    expect(() => assertMeasurementResults(invalid)).toThrow("must be expected");
  });

  it("必須契約の欠落を拒否する", () => {
    const invalid = report();
    invalid.suites[0].specs = invalid.suites[0].specs.slice(0, 1);
    invalid.stats.expected = 1;

    expect(() => assertMeasurementResults(invalid)).toThrow("MEASUREMENT-BROWSER-02 must run exactly once");
  });
});
