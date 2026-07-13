import { describe, expect, it } from "vitest";
import { DASHBOARD_TOUR_TARGET } from "../../dashboardTourTargets";
import type { Recruitment, Staff } from "../../types";
import { deriveDashboardOnboardingState } from "./deriveDashboardOnboardingState";

const managerOnly = [
  {
    _id: "staff-manager",
    name: "シフト担当者",
    email: "manager@example.com",
    isManager: true,
    isLineLinked: false,
    isLineFollowing: false,
  },
] as unknown as Staff[];

const recruitment = (overrides: Partial<Recruitment> = {}) =>
  ({
    _id: "rec-1",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-07",
    deadline: "2026-05-28",
    status: "open",
    responseCount: 0,
    totalStaffCount: 1,
    ...overrides,
  }) as unknown as Recruitment;

describe("deriveDashboardOnboardingState", () => {
  it("募集がない場合は募集作成を案内する", () => {
    const state = deriveDashboardOnboardingState({ recruitments: [], staffs: managerOnly });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "create_recruitment",
      tour: {
        target: DASHBOARD_TOUR_TARGET.createRecruitment,
        placement: "bottom",
      },
    });
  });

  it("募集作成後、提出がない場合はメールからの提出を案内する", () => {
    const state = deriveDashboardOnboardingState({ recruitments: [recruitment()], staffs: managerOnly });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "submit_self",
    });
    expect(state.kind === "visible" ? state.tour : undefined).toBeUndefined();
  });

  it("提出後、未確定の場合はシフト確認を案内する", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment({ responseCount: 1 })],
      staffs: managerOnly,
    });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "review_submission",
      tour: {
        target: DASHBOARD_TOUR_TARGET.latestRecruitment,
        placement: "top",
      },
    });
  });

  it("提出後にシフト表を確認済みならスタッフ追加を案内する", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment({ responseCount: 1 })],
      staffs: managerOnly,
      reviewedRecruitmentIds: ["rec-1"],
    });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "add_staff",
      tour: {
        target: DASHBOARD_TOUR_TARGET.addStaff,
        placement: "top",
      },
    });
  });

  it("提出がない募集は確認済みIDがあってもメールからの提出を案内する", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment()],
      staffs: managerOnly,
      reviewedRecruitmentIds: ["rec-1"],
    });
    expect(state).toMatchObject({ kind: "visible", stage: "submit_self" });
  });

  it("確定済みの募集はスタッフ追加を案内する", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment({ status: "confirmed", responseCount: 1 })],
      staffs: managerOnly,
    });
    expect(state).toMatchObject({ kind: "visible", stage: "add_staff" });
  });

  it("スタッフ数が増えても自動では非表示にしない", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment({ status: "confirmed", responseCount: 1 })],
      staffs: [
        ...managerOnly,
        {
          _id: "staff-2",
          name: "スタッフ",
          email: "staff@example.com",
          isManager: false,
          isLineLinked: false,
          isLineFollowing: false,
        },
      ] as unknown as Staff[],
    });
    expect(state).toMatchObject({ kind: "visible", stage: "add_staff" });
  });

  it("現在のステージがdismiss済みなら非表示にする", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment()],
      staffs: managerOnly,
      dismissedStages: ["submit_self"],
    });
    expect(state).toEqual({ kind: "hidden", reason: "dismissed", stage: "submit_self" });
  });
});
