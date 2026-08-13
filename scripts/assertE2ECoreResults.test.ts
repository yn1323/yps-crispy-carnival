import { describe, expect, it } from "vitest";
import { assertE2ECoreResults, EXPECTED_CORE_CONTRACTS } from "./assertE2ECoreResults.mjs";

function report(overrides: Record<string, { projectName?: string; status?: string; results?: unknown[] }> = {}) {
  return {
    suites: [
      {
        title: "core",
        specs: [...EXPECTED_CORE_CONTRACTS].map(([contractId, projectName]) => ({
          title: `[${contractId}] representative browser boundary`,
          tests: [
            {
              projectName,
              status: "expected",
              results: [{ duration: 100 }],
              ...overrides[contractId],
            },
          ],
        })),
      },
    ],
  };
}

describe("E2E core result gate", () => {
  it("desktop 12件、mobile 1件の13契約を固定する", () => {
    const projects = [...EXPECTED_CORE_CONTRACTS.values()];

    expect(EXPECTED_CORE_CONTRACTS.size).toBe(13);
    expect(projects.filter((projectName) => projectName === "desktop-chromium")).toHaveLength(12);
    expect(projects.filter((projectName) => projectName === "mobile-chrome")).toHaveLength(1);
  });

  it("契約ID、project、初回成功を件数に依存せず検証する", () => {
    expect(assertE2ECoreResults(report())).toEqual(
      [...EXPECTED_CORE_CONTRACTS].map(([contractId, projectName]) => ({
        contractId,
        projectName,
        status: "expected",
        retries: 0,
        durationMs: 100,
      })),
    );
  });

  it.each([
    ["skip", { "E2E-SHIFT-01": { status: "skipped" } }, "must be expected"],
    ["retry", { "E2E-AUTH-01": { results: [{ duration: 10 }, { duration: 20 }] } }, "first attempt"],
    ["wrong project", { "E2E-MOBILE-01": { projectName: "desktop-chromium" } }, "mobile-chrome"],
  ])("%sを拒否する", (_label, overrides, expectedMessage) => {
    expect(() => assertE2ECoreResults(report(overrides))).toThrow(expectedMessage);
  });

  it("必須契約の欠落を拒否する", () => {
    const missing = report();
    missing.suites[0].specs = missing.suites[0].specs.filter((spec) => !spec.title.includes("E2E-MANAGER-01"));

    expect(() => assertE2ECoreResults(missing)).toThrow("E2E-MANAGER-01 must run exactly once");
  });

  it("setup以外の契約IDなしテストを拒否する", () => {
    const untracked = report();
    untracked.suites[0].specs.push({
      title: "untagged representative browser boundary",
      tests: [{ projectName: "desktop-chromium", status: "expected", results: [{ duration: 100 }] }],
    });

    expect(() => assertE2ECoreResults(untracked)).toThrow("non-setup tests must declare a core contract");
  });

  it("setup projectは契約IDなしでも許可する", () => {
    const withSetup = report();
    withSetup.suites[0].specs.push({
      title: "prepare authenticated state",
      tests: [{ projectName: "setup", status: "expected", results: [{ duration: 100 }] }],
    });

    expect(assertE2ECoreResults(withSetup)).toHaveLength(EXPECTED_CORE_CONTRACTS.size);
  });
});
