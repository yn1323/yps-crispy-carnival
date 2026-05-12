import { describe, expect, it } from "vitest";
import type { Recruitment, Staff } from "../../types";
import { deriveDashboardOnboardingState } from "./deriveDashboardOnboardingState";

const ownerOnly = [
  {
    _id: "staff-owner",
    name: "店長",
    email: "owner@example.com",
    isOwner: true,
    isLineLinked: false,
    isLineFollowing: false,
  },
] as unknown as Staff[];

const twoStaffs = [
  ...ownerOnly,
  {
    _id: "staff-2",
    name: "スタッフ",
    email: "staff@example.com",
    isOwner: false,
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
    ...overrides,
  }) as unknown as Recruitment;

describe("deriveDashboardOnboardingState", () => {
  it("募集がない場合は募集作成を案内する", () => {
    const state = deriveDashboardOnboardingState({ recruitments: [], staffs: ownerOnly });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "create_recruitment",
      progressLabel: "1/4",
      title: "シフト作成から提出までの流れを体験しましょう",
      description: "期間を決めてシフトを募集してみましょう。",
    });
  });

  it("募集作成後、提出がない場合はメールからの提出を案内する", () => {
    const state = deriveDashboardOnboardingState({ recruitments: [recruitment()], staffs: ownerOnly });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "submit_self",
      progressLabel: "2/4",
      title: "希望シフトを提出してみましょう",
      description: "登録したメールに届いたリンクからシフトを提出してみましょう。",
    });
    expect(state.kind === "visible" ? state.tour : undefined).toBeUndefined();
  });

  it("提出後、未確定の場合はシフト確認を案内する", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment({ responseCount: 1 })],
      staffs: ownerOnly,
    });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "review_submission",
      progressLabel: "3/4",
      title: "提出されたシフトを確認しましょう",
      description: "シフト表が更新されていることを確認しましょう。",
    });
  });

  it("提出後にシフト表を確認済みならスタッフ追加を案内する", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment({ responseCount: 1 })],
      staffs: ownerOnly,
      reviewedRecruitmentIds: ["rec-1"],
    });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "add_staff",
      progressLabel: "4/4",
      title: "スタッフを追加してシフト提出をお願いしましょう",
      description: "スタッフ追加時にシフト提出依頼のメール・LINE連携案内を送ります。",
    });
  });

  it("提出がない募集は確認済みIDがあってもメールからの提出を案内する", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment()],
      staffs: ownerOnly,
      reviewedRecruitmentIds: ["rec-1"],
    });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "submit_self",
      progressLabel: "2/4",
    });
  });

  it("確定済みの募集はスタッフ追加を案内する", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment({ status: "confirmed", responseCount: 1 })],
      staffs: ownerOnly,
    });
    expect(state).toMatchObject({
      kind: "visible",
      stage: "add_staff",
      progressLabel: "4/4",
    });
  });

  it("owner含む2名以上なら非表示にする", () => {
    const state = deriveDashboardOnboardingState({ recruitments: [recruitment()], staffs: twoStaffs });
    expect(state).toEqual({ kind: "hidden", reason: "enough_staffs" });
  });

  it("現在のステージがdismiss済みなら非表示にする", () => {
    const state = deriveDashboardOnboardingState({
      recruitments: [recruitment()],
      staffs: ownerOnly,
      dismissedStages: ["submit_self"],
    });
    expect(state).toEqual({ kind: "hidden", reason: "dismissed", stage: "submit_self" });
  });
});
