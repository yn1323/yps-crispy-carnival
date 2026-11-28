import { describe, expect, it } from "vitest";
import { type AutoCreateHistoryRecruitment, summarizeAutoCreateHistory } from "./history";

const recruitment = (overrides: Partial<AutoCreateHistoryRecruitment> = {}): AutoCreateHistoryRecruitment => ({
  submittedStaffIds: [],
  requestedDays: [],
  assignments: [],
  ...overrides,
});

describe("summarizeAutoCreateHistory", () => {
  it("過去の募集がなければ、募集の数は0で、人は返さない", () => {
    expect(summarizeAutoCreateHistory({ recruitments: [], staffIds: ["a", "b"] })).toEqual({
      recruitmentCount: 0,
      staffs: [],
    });
  });

  it("希望した日数と、そのうち勤務が入った日数を、複数の募集を通して数える", () => {
    const result = summarizeAutoCreateHistory({
      staffIds: ["a"],
      recruitments: [
        recruitment({
          submittedStaffIds: ["a"],
          requestedDays: [
            { staffId: "a", date: "2026-08-10" },
            { staffId: "a", date: "2026-08-11" },
            { staffId: "a", date: "2026-08-12" },
          ],
          assignments: [{ staffId: "a", date: "2026-08-10", positionId: "hall" }],
        }),
        recruitment({
          submittedStaffIds: ["a"],
          requestedDays: [
            { staffId: "a", date: "2026-08-03" },
            { staffId: "a", date: "2026-08-04" },
          ],
          assignments: [
            { staffId: "a", date: "2026-08-03", positionId: "hall" },
            { staffId: "a", date: "2026-08-04", positionId: "kitchen" },
          ],
        }),
      ],
    });

    expect(result).toEqual({
      recruitmentCount: 2,
      staffs: [
        {
          staffId: "a",
          requestedDays: 5,
          assignedDays: 3,
          lastRequestedDays: 3,
          lastAssignedDays: 1,
          positions: [
            { positionId: "hall", days: 2 },
            { positionId: "kitchen", days: 1 },
          ],
        },
      ],
    });
  });

  it("同じ日の希望と勤務が複数あっても、1日として数える", () => {
    const result = summarizeAutoCreateHistory({
      staffIds: ["a"],
      recruitments: [
        recruitment({
          submittedStaffIds: ["a"],
          requestedDays: [
            { staffId: "a", date: "2026-08-10" },
            { staffId: "a", date: "2026-08-10" },
          ],
          assignments: [
            { staffId: "a", date: "2026-08-10", positionId: "hall" },
            { staffId: "a", date: "2026-08-10", positionId: "hall" },
            { staffId: "a", date: "2026-08-10", positionId: "kitchen" },
          ],
        }),
      ],
    });

    expect(result.staffs).toEqual([
      {
        staffId: "a",
        requestedDays: 1,
        assignedDays: 1,
        lastRequestedDays: 1,
        lastAssignedDays: 1,
        positions: [
          { positionId: "hall", days: 1 },
          { positionId: "kitchen", days: 1 },
        ],
      },
    ]);
  });

  it("希望のない日の勤務と、提出していない人の勤務は数えない", () => {
    const result = summarizeAutoCreateHistory({
      staffIds: ["a", "b"],
      recruitments: [
        recruitment({
          submittedStaffIds: ["a"],
          requestedDays: [
            { staffId: "a", date: "2026-08-10" },
            // 提出していない人の希望が残っていても、数えない。
            { staffId: "b", date: "2026-08-10" },
          ],
          assignments: [
            { staffId: "a", date: "2026-08-10", positionId: "hall" },
            // 希望のない日に入った勤務。
            { staffId: "a", date: "2026-08-11", positionId: "hall" },
            { staffId: "b", date: "2026-08-10", positionId: "hall" },
          ],
        }),
      ],
    });

    expect(result.staffs).toEqual([
      {
        staffId: "a",
        requestedDays: 1,
        assignedDays: 1,
        lastRequestedDays: 1,
        lastAssignedDays: 1,
        positions: [{ positionId: "hall", days: 1 }],
      },
    ]);
  });

  it("直近の1回に提出していない人は、直近の数が0になる", () => {
    const result = summarizeAutoCreateHistory({
      staffIds: ["a"],
      recruitments: [
        recruitment(),
        recruitment({
          submittedStaffIds: ["a"],
          requestedDays: [{ staffId: "a", date: "2026-08-03" }],
          assignments: [],
        }),
      ],
    });

    expect(result).toEqual({
      recruitmentCount: 2,
      staffs: [
        {
          staffId: "a",
          requestedDays: 1,
          assignedDays: 0,
          lastRequestedDays: 0,
          lastAssignedDays: 0,
          positions: [],
        },
      ],
    });
  });

  it("対象でない人は返さず、返す人は渡した並びにする", () => {
    const requested = (staffId: string) => ({ staffId, date: "2026-08-10" });
    const result = summarizeAutoCreateHistory({
      staffIds: ["c", "a"],
      recruitments: [
        recruitment({
          submittedStaffIds: ["a", "b", "c"],
          requestedDays: [requested("a"), requested("b"), requested("c")],
          assignments: [],
        }),
      ],
    });

    expect(result.staffs.map((staff) => staff.staffId)).toEqual(["c", "a"]);
  });
});
