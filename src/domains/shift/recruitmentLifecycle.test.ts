import { describe, expect, it } from "vitest";
import { getRecruitmentDeadlineDays, getRecruitmentLifecycleStatus } from "./recruitmentLifecycle";

const TODAY = "2026-06-16";
const recruitment = {
  status: "open" as const,
  deadline: "2026-06-25",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-15",
};

describe("募集ライフサイクル", () => {
  it.each([
    [recruitment, "collecting"],
    [{ ...recruitment, deadline: "2026-06-10" }, "action-required"],
    [
      { ...recruitment, deadline: "2026-06-05", periodStart: "2026-06-01", periodEnd: "2026-06-10" },
      "ended-unconfirmed",
    ],
    [{ ...recruitment, status: "confirmed", periodStart: "2026-06-01", periodEnd: TODAY }, "current"],
    [{ ...recruitment, status: "confirmed" }, "confirmed"],
    [{ ...recruitment, status: "confirmed", periodStart: "2026-05-01", periodEnd: "2026-05-31" }, "ended"],
  ] as const)("同じ日付境界から状態を導出する", (input, expected) => {
    expect(getRecruitmentLifecycleStatus(input, TODAY)).toBe(expected);
  });

  it("締切までの日数を基準日から数える", () => {
    expect(getRecruitmentDeadlineDays("2026-06-15", TODAY)).toBe(-1);
    expect(getRecruitmentDeadlineDays(TODAY, TODAY)).toBe(0);
    expect(getRecruitmentDeadlineDays("2026-06-18", TODAY)).toBe(2);
  });
});
