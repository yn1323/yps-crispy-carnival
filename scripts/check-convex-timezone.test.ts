import { describe, expect, it } from "vitest";
import { findConvexTimezoneIssuesInSource, shouldCheckConvexTimezoneFile } from "./check-convex-timezone";

describe("check-convex-timezone", () => {
  it("detects risky Convex date conversion patterns", () => {
    const source = `
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date().toISOString().split("T")[0];
const fixed = new Date("2026-06-01");
const cutoff = Date.UTC(2026, 5, 1, 15);
`;

    const issues = findConvexTimezoneIssuesInSource(source, "convex/example.ts");

    expect(issues.map((issue) => issue.ruleId)).toEqual([
      "toISOString-date-slice",
      "toISOString-date-split",
      "date-only-constructor",
      "date-utc-direct",
    ]);
  });

  it("does not flag safe calls to business date helpers", () => {
    const source = `
const today = todayJST();
const deadlineCutoff = getDeadlineCutoff(recruitment.deadline);
const submitLinkCutoff = getSubmitLinkCutoff(recruitment.periodStart);
`;

    expect(findConvexTimezoneIssuesInSource(source, "convex/example.ts")).toEqual([]);
  });

  it("limits the file target to production Convex code", () => {
    expect(shouldCheckConvexTimezoneFile("convex/recruitment/mutations.ts")).toBe(true);
    expect(shouldCheckConvexTimezoneFile("convex/_lib/dateFormat.ts")).toBe(false);
    expect(shouldCheckConvexTimezoneFile("convex/_scenario/shiftRequestCollection.test.ts")).toBe(false);
    expect(shouldCheckConvexTimezoneFile("convex/_test/scenarioBuilders.ts")).toBe(false);
    expect(shouldCheckConvexTimezoneFile("convex/testing.ts")).toBe(false);
    expect(shouldCheckConvexTimezoneFile("convex/recruitment/mutations.test.ts")).toBe(false);
    expect(shouldCheckConvexTimezoneFile("src/domains/shift/date.ts")).toBe(false);
  });
});
