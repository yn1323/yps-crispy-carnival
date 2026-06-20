import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import type { Recruitment } from "./types";
import {
  buildDashboardRecruitmentGroups,
  getDashboardRecruitmentGroupKey,
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

  it("未確定で締切後なら要シフト調整として扱う", () => {
    const overdue = recruitment({ deadline: "2026-06-10" });
    expect(getDisplayStatus(overdue, now)).toBe("action-required");
    expect(getDashboardRecruitmentGroupKey(overdue, now)).toBe("actionRequired");
  });

  it("未確定のまま期間終了した募集も要シフト調整として扱う", () => {
    const endedOpen = recruitment({
      periodStart: "2026-06-01",
      periodEnd: "2026-06-10",
      deadline: "2026-06-25",
    });
    expect(getDisplayStatus(endedOpen, now)).toBe("action-required");
    expect(getDashboardRecruitmentGroupKey(endedOpen, now)).toBe("actionRequired");
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

  it("ダッシュボードのシフト一覧は現在のシフトを先頭グループにして重複を除く", () => {
    const current = recruitment({
      _id: "current" as Recruitment["_id"],
      status: "confirmed",
      periodStart: "2026-06-09",
      periodEnd: "2026-06-30",
    });
    const future = recruitment({ _id: "future" as Recruitment["_id"], periodStart: "2026-07-01" });
    const actionRequired = recruitment({
      _id: "action-required" as Recruitment["_id"],
      deadline: "2026-06-10",
      periodStart: "2026-07-01",
    });

    const result = buildDashboardRecruitmentGroups({
      recruitments: [future, current, actionRequired, current],
      now,
    });

    expect(result.groups.map((group) => group.key)).toEqual(["current", "actionRequired", "collecting"]);
    expect(result.groups.flatMap((group) => group.recruitments.map((r) => r._id))).toEqual([
      "current",
      "action-required",
      "future",
    ]);
  });

  it("現在・要シフト調整・募集中・確定済みは渡された件数をすべて表示する", () => {
    const current = recruitment({
      _id: "current" as Recruitment["_id"],
      status: "confirmed",
      periodStart: "2026-06-09",
      periodEnd: "2026-06-30",
    });
    const recruitments = ["first", "second", "third"].map((idValue) =>
      recruitment({ _id: idValue as Recruitment["_id"] }),
    );

    const result = buildDashboardRecruitmentGroups({
      recruitments: [current, ...recruitments],
      now,
    });

    expect(result.groups.flatMap((group) => group.recruitments.map((r) => r._id))).toEqual([
      "current",
      "first",
      "second",
      "third",
    ]);
    expect(result.totalCount).toBe(4);
  });

  it("募集中は締切が近い順に並べる", () => {
    const laterDeadline = recruitment({ _id: "later" as Recruitment["_id"], deadline: "2026-06-25" });
    const soonerDeadline = recruitment({ _id: "sooner" as Recruitment["_id"], deadline: "2026-06-18" });

    const result = buildDashboardRecruitmentGroups({
      recruitments: [laterDeadline, soonerDeadline],
      now,
    });

    expect(result.groups[0]).toMatchObject({ key: "collecting" });
    expect(result.groups[0].recruitments.map((r) => r._id)).toEqual(["sooner", "later"]);
  });

  it("未来の確定済みは開始日が近い順に並べる", () => {
    const later = recruitment({
      _id: "later" as Recruitment["_id"],
      status: "confirmed",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    const sooner = recruitment({
      _id: "sooner" as Recruitment["_id"],
      status: "confirmed",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });

    const result = buildDashboardRecruitmentGroups({
      recruitments: [later, sooner],
      now,
    });

    expect(result.groups[0]).toMatchObject({ key: "confirmed" });
    expect(result.groups[0].recruitments.map((r) => r._id)).toEqual(["sooner", "later"]);
  });

  it("過去の確定済みシフトは過去グループに入る", () => {
    const recentPast = recruitment({
      _id: "recent-past" as Recruitment["_id"],
      status: "confirmed",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-15",
    });
    const olderPast = recruitment({
      _id: "older-past" as Recruitment["_id"],
      status: "confirmed",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-15",
    });

    const result = buildDashboardRecruitmentGroups({
      recruitments: [olderPast, recentPast],
      now,
    });

    expect(result.groups[0]).toMatchObject({ key: "past", title: "過去のシフト", totalCount: 2 });
    expect(result.groups[0].recruitments.map((r) => r._id)).toEqual(["recent-past", "older-past"]);
  });
});
