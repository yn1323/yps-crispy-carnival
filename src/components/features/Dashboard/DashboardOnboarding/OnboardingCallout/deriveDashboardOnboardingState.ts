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
      reason: "dismissed";
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
  dismissedStages = [],
  reviewedRecruitmentIds = [],
}: Params): DashboardOnboardingState {
  const latestRecruitment = recruitments[0];
  const state = latestRecruitment
    ? deriveStateWithRecruitment(latestRecruitment, reviewedRecruitmentIds)
    : visibleState({
        stage: "create_recruitment",
        progressLabel: "1/4",
        title: "シフト作成から提出までの流れを体験しましょう",
        description: "期間を決めてシフトを募集してみましょう。（作成したシフトはあとで削除可能です）",
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
      title: "スタッフを追加してシフト提出をお願いしましょう",
      description: "スタッフ追加時にシフト提出依頼のメール・LINE連携案内を送ります。",
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
      description: "シフト表が更新されていることを確認しましょう。",
      tour: {
        target: DASHBOARD_TOUR_TARGET.latestRecruitment,
        placement: "top",
      },
    });
  }

  return visibleState({
    stage: "submit_self",
    progressLabel: "2/4",
    title: "希望シフトを提出してみましょう",
    description: "登録したメールに届いたリンクからシフトを提出してみましょう。",
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
