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
  it("desktop 15件、mobile 1件の16契約を固定する", () => {
    const projects = [...EXPECTED_CORE_CONTRACTS.values()];

    expect(EXPECTED_CORE_CONTRACTS.size).toBe(16);
    expect(projects.filter((projectName) => projectName === "desktop-chromium")).toHaveLength(15);
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
    ["export skip", { "E2E-EXPORT-01": { status: "skipped" } }, "E2E-EXPORT-01 must be expected"],
    [
      "export retry",
      { "E2E-EXPORT-02": { results: [{ duration: 10 }, { duration: 20 }] } },
      "E2E-EXPORT-02 must pass on the first attempt",
    ],
    [
      "export wrong project",
      { "E2E-EXPORT-01": { projectName: "mobile-chrome" } },
      "E2E-EXPORT-01 must run in desktop-chromium",
    ],
  ])("%sを拒否する", (_label, overrides, expectedMessage) => {
    expect(() => assertE2ECoreResults(report(overrides))).toThrow(expectedMessage);
  });

  it("必須契約の欠落を拒否する", () => {
    const missing = report();
    missing.suites[0].specs = missing.suites[0].specs.filter((spec) => !spec.title.includes("E2E-MANAGER-01"));

    expect(() => assertE2ECoreResults(missing)).toThrow("E2E-MANAGER-01 must run exactly once");
  });

  it.each(["E2E-EXPORT-01", "E2E-EXPORT-02"])("%sの欠落と重複を拒否する", (contractId) => {
    const missing = report();
    missing.suites[0].specs = missing.suites[0].specs.filter((spec) => !spec.title.includes(contractId));
    expect(() => assertE2ECoreResults(missing)).toThrow(`${contractId} must run exactly once (actual: 0)`);

    const duplicate = report();
    const scenario = duplicate.suites[0].specs.find((spec) => spec.title.includes(contractId));
    if (!scenario) throw new Error("Missing export fixture");
    duplicate.suites[0].specs.push(scenario);
    expect(() => assertE2ECoreResults(duplicate)).toThrow(`${contractId} must run exactly once (actual: 2)`);
  });

  it("登録済みの出力契約が成功していても未知の契約を拒否する", () => {
    const unknown = report();
    unknown.suites[0].specs.push({
      title: "[E2E-UNKNOWN-01] unregistered browser boundary",
      tests: [{ projectName: "desktop-chromium", status: "expected", results: [{ duration: 100 }] }],
    });
    expect(() => assertE2ECoreResults(unknown)).toThrow("unknown core contracts: E2E-UNKNOWN-01");
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
