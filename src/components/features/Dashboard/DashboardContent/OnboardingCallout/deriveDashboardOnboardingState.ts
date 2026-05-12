import { DASHBOARD_TOUR_TARGET } from "../../dashboardTourTargets";
import type { Recruitment, Staff } from "../../types";

export type DashboardOnboardingStage = "create_recruitment" | "submit_self" | "review_submission" | "add_staff";
export type DashboardOnboardingTourPlacement = "bottom" | "top";
export type DashboardOnboardingProgressLabel = "1/4" | "2/4" | "3/4" | "4/4";

export type DashboardOnboardingState =
  | {
      kind: "visible";
      stage: DashboardOnboardingStage;
      progressLabel: DashboardOnboardingProgressLabel;
      title: string;
      description: string;
      tour?: {
        target: string;
        placement: DashboardOnboardingTourPlacement;
      };
    }
  | {
      kind: "hidden";
      reason: "dismissed" | "enough_staffs";
      stage?: DashboardOnboardingStage;
    };

type Params = {
  recruitments: Recruitment[];
  staffs: Staff[];
  dismissedStages?: readonly DashboardOnboardingStage[];
  reviewedRecruitmentIds?: readonly string[];
};

export function deriveDashboardOnboardingState({
  recruitments,
  staffs,
  dismissedStages = [],
  reviewedRecruitmentIds = [],
}: Params): DashboardOnboardingState {
  if (staffs.length >= 2) {
    return { kind: "hidden", reason: "enough_staffs" };
  }

  const latestRecruitment = recruitments[0];
  const state = latestRecruitment
    ? deriveStateWithRecruitment(latestRecruitment, reviewedRecruitmentIds)
    : visibleState({
        stage: "create_recruitment",
        progressLabel: "1/4",
        title: "シフト作成〜提出までの流れを確認しましょう",
        description: "期間を決めてシフト募集をはじめましょう。",
        tour: {
          target: DASHBOARD_TOUR_TARGET.createRecruitment,
          placement: "bottom",
        },
      });

  if (state.kind === "visible" && dismissedStages.includes(state.stage)) {
    return { kind: "hidden", reason: "dismissed", stage: state.stage };
  }

  return state;
}

function deriveStateWithRecruitment(
  recruitment: Recruitment,
  reviewedRecruitmentIds: readonly string[],
): DashboardOnboardingState {
  const hasReviewedShiftBoard = reviewedRecruitmentIds.includes(recruitment._id);

  if (recruitment.status === "confirmed" || (recruitment.responseCount > 0 && hasReviewedShiftBoard)) {
    return visibleState({
      stage: "add_staff",
      progressLabel: "4/4",
      title: "スタッフを追加してシフト提出をお願いしよう",
      description: "スタッフ追加時にシフト提出依頼のメール・LINE連携案内を送信します。",
      tour: {
        target: DASHBOARD_TOUR_TARGET.addStaff,
        placement: "top",
      },
    });
  }

  if (recruitment.responseCount > 0) {
    return visibleState({
      stage: "review_submission",
      progressLabel: "3/4",
      title: "提出されたシフトを確認しましょう",
      description: "提出されたシフトがシフト表に反映されていることを確認しましょう。",
      tour: {
        target: DASHBOARD_TOUR_TARGET.latestRecruitment,
        placement: "top",
      },
    });
  }

  return visibleState({
    stage: "submit_self",
    progressLabel: "2/4",
    title: "登録したメールアドレスにシフト提出のお願いを送付しました。",
    description: "メールを開いてシフトを提出してみましょう。",
  });
}

type VisibleStateParams = {
  stage: DashboardOnboardingStage;
  progressLabel: DashboardOnboardingProgressLabel;
  title: string;
  description: string;
  tour?: {
    target: string;
    placement: DashboardOnboardingTourPlacement;
  };
};

function visibleState({
  stage,
  progressLabel,
  title,
  description,
  tour,
}: VisibleStateParams): DashboardOnboardingState {
  return {
    kind: "visible",
    stage,
    progressLabel,
    title,
    description,
    tour,
  };
}
