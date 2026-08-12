// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recruitment, Staff } from "../types";
import type { DashboardOnboardingRenderState } from ".";
import type { DashboardOnboardingStage } from "./OnboardingCallout/deriveDashboardOnboardingState";

const mocks = vi.hoisted(() => ({
  dismissReference: Symbol("dismissOnboarding"),
  dismissOnboarding: vi.fn(),
  useMutation: vi.fn(),
  showErrorToast: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: mocks.useMutation,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { dashboard: { mutations: { dismissOnboarding: mocks.dismissReference } } },
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
}));

vi.mock("./DashboardOnboardingView", () => ({
  DashboardOnboardingView: ({
    state,
    onDismiss,
  }: {
    state: { stage: DashboardOnboardingStage };
    onDismiss: (stage: DashboardOnboardingStage) => void;
  }) => (
    <div>
      <output data-testid="stage">{state.stage}</output>
      <button type="button" onClick={() => onDismiss(state.stage)}>
        ガイドを閉じる
      </button>
    </div>
  ),
}));

import { DashboardOnboarding } from ".";

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
    periodStart: "2026-08-01",
    periodEnd: "2026-08-07",
    deadline: "2026-07-28",
    status: "open",
    responseCount: 1,
    totalStaffCount: 1,
    ...overrides,
  }) as unknown as Recruitment;

const renderOnboarding = ({
  recruitments = [],
  pendingStaffRequestCount = 0,
  isDismissed = false,
}: {
  recruitments?: Recruitment[];
  pendingStaffRequestCount?: number;
  isDismissed?: boolean;
} = {}) =>
  render(
    <DashboardOnboarding
      recruitments={recruitments}
      staffs={managerOnly}
      pendingStaffRequestCount={pendingStaffRequestCount}
      isDismissed={isDismissed}
      canShow
    >
      {(state) => <OnboardingProbe state={state} latestRecruitmentId={recruitments[0]?._id} />}
    </DashboardOnboarding>,
  );

function OnboardingProbe({
  state,
  latestRecruitmentId,
}: {
  state: DashboardOnboardingRenderState;
  latestRecruitmentId: Recruitment["_id"] | undefined;
}) {
  return (
    <div>
      <output data-testid="visible">{String(state.isVisible)}</output>
      {state.content}
      {latestRecruitmentId && (
        <button type="button" onClick={() => state.onOpenRecruitment(latestRecruitmentId)}>
          シフト表を開く
        </button>
      )}
    </div>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.dismissOnboarding.mockReset();
  mocks.useMutation.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.dismissOnboarding.mockResolvedValue(null);
  mocks.useMutation.mockReturnValue(mocks.dismissOnboarding);
});

describe("DashboardOnboarding", () => {
  it("最新募集のシフト表を開いたことをsessionStorageへ保存し、スタッフ追加案内へ進む", async () => {
    renderOnboarding({ recruitments: [recruitment()] });
    expect(screen.getByTestId("stage").textContent).toBe("review_submission");

    fireEvent.click(screen.getByRole("button", { name: "シフト表を開く" }));

    await waitFor(() => expect(screen.getByTestId("stage").textContent).toBe("add_staff"));
    expect(window.sessionStorage.getItem("dashboardOnboardingReviewedRecruitments")).toBe('["rec-1"]');
  });

  it("sessionStorageの確認済み募集IDを初期状態へ復元し、不正な要素は無視する", () => {
    window.sessionStorage.setItem("dashboardOnboardingReviewedRecruitments", '["rec-1",42,null]');

    renderOnboarding({ recruitments: [recruitment({ _id: "rec-2" as Recruitment["_id"] })] });

    expect(screen.getByTestId("stage").textContent).toBe("review_submission");
    fireEvent.click(screen.getByRole("button", { name: "シフト表を開く" }));
    expect(window.sessionStorage.getItem("dashboardOnboardingReviewedRecruitments")).toBe('["rec-1","rec-2"]');
  });

  it("sessionStorageが壊れていても初期表示を止めず、未確認の案内を表示する", () => {
    window.sessionStorage.setItem("dashboardOnboardingReviewedRecruitments", "invalid-json");

    renderOnboarding({ recruitments: [recruitment()] });

    expect(screen.getByTestId("stage").textContent).toBe("review_submission");
  });

  it("sessionStorageへ書き込めなくても現在の案内は次へ進める", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    renderOnboarding({ recruitments: [recruitment()] });
    fireEvent.click(screen.getByRole("button", { name: "シフト表を開く" }));

    await waitFor(() => expect(screen.getByTestId("stage").textContent).toBe("add_staff"));
    expect(setItemSpy).toHaveBeenCalledWith("dashboardOnboardingReviewedRecruitments", '["rec-1"]');
    setItemSpy.mockRestore();
  });

  it("閉じる操作で空引数のmutationを実行し、成功後に現在の案内を非表示にする", async () => {
    renderOnboarding();
    expect(screen.getByTestId("stage").textContent).toBe("create_recruitment");

    fireEvent.click(screen.getByRole("button", { name: "ガイドを閉じる" }));

    await waitFor(() => expect(screen.getByTestId("visible").textContent).toBe("false"));
    expect(mocks.useMutation).toHaveBeenCalledWith(mocks.dismissReference);
    expect(mocks.dismissOnboarding).toHaveBeenCalledOnce();
    expect(mocks.dismissOnboarding).toHaveBeenCalledWith({});
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("閉じるmutationが失敗した場合はエラーを表示し、案内を閉じない", async () => {
    const error = new Error("dismiss failed");
    mocks.dismissOnboarding.mockRejectedValue(error);

    renderOnboarding();
    fireEvent.click(screen.getByRole("button", { name: "ガイドを閉じる" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledWith(error));
    expect(screen.getByTestId("visible").textContent).toBe("true");
    expect(screen.getByTestId("stage").textContent).toBe("create_recruitment");
  });

  it("スタッフ申請が届いた場合は案内を自動終了し、dismissを一度だけ保存する", async () => {
    const { rerender } = renderOnboarding({ pendingStaffRequestCount: 1 });

    expect(screen.getByTestId("visible").textContent).toBe("false");
    await waitFor(() => expect(mocks.dismissOnboarding).toHaveBeenCalledOnce());
    expect(mocks.dismissOnboarding).toHaveBeenCalledWith({});

    rerender(
      <DashboardOnboarding
        recruitments={[]}
        staffs={managerOnly}
        pendingStaffRequestCount={2}
        isDismissed={false}
        canShow
      >
        {(state) => <OnboardingProbe state={state} latestRecruitmentId={undefined} />}
      </DashboardOnboarding>,
    );

    await waitFor(() => expect(mocks.dismissOnboarding).toHaveBeenCalledOnce());
  });
});
