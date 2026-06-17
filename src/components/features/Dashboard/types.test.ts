import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import type { Recruitment } from "./types";
import {
  buildDashboardRecruitmentList,
  getDisplayStatus,
  isCurrentRecruitment,
  sortRecruitmentsByPeriodStart,
} from "./types";

const now = dayjs("2026-06-16");

const recruitment = (overrides: Partial<Recruitment> = {}) =>
  ({
    _id: "rec-1",
    createdAt: 1,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-15",
    deadline: "2026-06-25",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    responseCount: 0,
    totalStaffCount: 4,
    ...overrides,
  }) as unknown as Recruitment;

describe("Dashboard recruitment display helpers", () => {
  it("未確定で締切前なら募集中として扱う", () => {
    expect(getDisplayStatus(recruitment({ deadline: "2026-06-25" }), now)).toBe("collecting");
  });

  it("未確定で締切後なら締切済みとして扱う", () => {
    expect(getDisplayStatus(recruitment({ deadline: "2026-06-10" }), now)).toBe("past-deadline");
  });

  it("確定済みで今日が期間内なら現在のシフトとして扱う", () => {
    const current = recruitment({
      status: "confirmed",
      periodStart: "2026-06-09",
      periodEnd: "2026-06-30",
      deadline: "2026-06-07",
    });
    expect(isCurrentRecruitment(current, now)).toBe(true);
    expect(getDisplayStatus(current, now)).toBe("current");
  });

  it("確定済みでも未来のシフトは終了済みにしない", () => {
    expect(
      getDisplayStatus(
        recruitment({
          status: "confirmed",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-31",
          deadline: "2026-06-25",
        }),
        now,
      ),
    ).toBe("confirmed");
  });

  it("終了日が今日より前なら終了済みとして扱う", () => {
    expect(
      getDisplayStatus(
        recruitment({
          status: "confirmed",
          periodStart: "2026-05-01",
          periodEnd: "2026-05-31",
          deadline: "2026-04-25",
        }),
        now,
      ),
    ).toBe("ended");
  });

  it("募集一覧は開始日降順、同じ開始日なら作成日降順に並べる", () => {
    const olderSameStart = recruitment({ _id: "old-same-start" as Recruitment["_id"], createdAt: 10 });
    const newerSameStart = recruitment({ _id: "new-same-start" as Recruitment["_id"], createdAt: 20 });
    const latestStart = recruitment({
      _id: "latest-start" as Recruitment["_id"],
      createdAt: 5,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });

    expect(sortRecruitmentsByPeriodStart([olderSameStart, latestStart, newerSameStart]).map((r) => r._id)).toEqual([
      "latest-start",
      "new-same-start",
      "old-same-start",
    ]);
  });

  it("ダッシュボードのシフト一覧は現在のシフトを先頭にして重複を除く", () => {
    const current = recruitment({
      _id: "current" as Recruitment["_id"],
      status: "confirmed",
      periodStart: "2026-06-09",
      periodEnd: "2026-06-30",
    });
    const future = recruitment({ _id: "future" as Recruitment["_id"], periodStart: "2026-07-01" });
    const older = recruitment({ _id: "older" as Recruitment["_id"], periodStart: "2026-06-01" });

    expect(
      buildDashboardRecruitmentList({
        currentRecruitments: [current],
        recruitments: [future, current, older],
      }).map((r) => r._id),
    ).toEqual(["current", "future", "older"]);
  });

  it("ダッシュボードのシフト一覧は現在のシフトを含めて3件表示する", () => {
    const current = recruitment({ _id: "current" as Recruitment["_id"], status: "confirmed" });
    const recruitments = ["first", "second", "third"].map((idValue) =>
      recruitment({ _id: idValue as Recruitment["_id"] }),
    );

    const visibleRecruitments = buildDashboardRecruitmentList({
      currentRecruitments: [current],
      recruitments,
    }).slice(0, 3);

    expect(visibleRecruitments.map((r) => r._id)).toEqual(["current", "first", "second"]);
  });
});
