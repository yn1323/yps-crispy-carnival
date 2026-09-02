import { useMutation } from "convex/react";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast } from "@/src/components/shared/feedback";
import type { Recruitment, Staff } from "../types";
import { DashboardOnboardingView } from "./DashboardOnboardingView";
import {
  type DashboardOnboardingStage,
  deriveDashboardOnboardingState,
} from "./OnboardingCallout/deriveDashboardOnboardingState";

const REVIEWED_RECRUITMENT_STORAGE_KEY = "dashboardOnboardingReviewedRecruitments";
const COMPLETED_ONBOARDING_STAGES: DashboardOnboardingStage[] = [
  "create_recruitment",
  "submit_self",
  "review_submission",
  "add_staff",
];

export type DashboardOnboardingRenderState = {
  content: ReactNode;
  isDismissed: boolean;
  isVisible: boolean;
  onOpenRecruitment: (recruitmentId: Recruitment["_id"]) => void;
};

type Props = {
  recruitments: Recruitment[];
  staffs: Staff[];
  pendingStaffRequestCount: number;
  isDismissed: boolean;
  canShow: boolean;
  children: (state: DashboardOnboardingRenderState) => ReactNode;
};

export function DashboardOnboarding({
  recruitments,
  staffs,
  pendingStaffRequestCount,
  isDismissed,
  canShow,
  children,
}: Props) {
  const dismissOnboarding = useMutation(api.dashboard.mutations.dismissOnboarding);
  const [dismissedStages, setDismissedStages] = useState<DashboardOnboardingStage[]>([]);
  const [autoDismissed, setAutoDismissed] = useState(false);
  const [reviewedRecruitmentIds, setReviewedRecruitmentIds] = useState(readReviewedRecruitmentIds);
  const shouldTreatAsDismissed = isDismissed || autoDismissed || pendingStaffRequestCount > 0;
  const state = deriveDashboardOnboardingState({
    recruitments,
    staffs,
    dismissedStages: shouldTreatAsDismissed ? COMPLETED_ONBOARDING_STAGES : dismissedStages,
    reviewedRecruitmentIds,
  });
  const visibleState = canShow && state.kind === "visible" ? state : null;
  const latestRecruitment = recruitments[0];

  useEffect(() => {
    if (pendingStaffRequestCount === 0 || isDismissed || autoDismissed) return;
    setAutoDismissed(true);
    setDismissedStages(COMPLETED_ONBOARDING_STAGES);
    dismissOnboarding({}).catch(showErrorToast);
  }, [autoDismissed, dismissOnboarding, isDismissed, pendingStaffRequestCount]);

  const handleDismiss = async (stage: DashboardOnboardingStage) => {
    try {
      await dismissOnboarding({});
      setDismissedStages((current) => (current.includes(stage) ? current : [...current, stage]));
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleOpenRecruitment = (recruitmentId: Recruitment["_id"]) => {
    if (visibleState?.stage !== "review_submission" || latestRecruitment?._id !== recruitmentId) return;

    setReviewedRecruitmentIds((current) => {
      if (current.includes(recruitmentId)) return current;
      const next = [...current, recruitmentId];
      writeReviewedRecruitmentIds(next);
      return next;
    });
  };

  return children({
    content: visibleState ? <DashboardOnboardingView state={visibleState} onDismiss={handleDismiss} /> : null,
    isDismissed: state.kind === "hidden" && state.reason === "dismissed",
    isVisible: visibleState !== null,
    onOpenRecruitment: handleOpenRecruitment,
  });
}

function readReviewedRecruitmentIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.sessionStorage.getItem(REVIEWED_RECRUITMENT_STORAGE_KEY);
    if (!rawValue) return [];
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];
    return parsedValue.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function writeReviewedRecruitmentIds(recruitmentIds: readonly string[]) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(REVIEWED_RECRUITMENT_STORAGE_KEY, JSON.stringify(recruitmentIds));
  } catch {
    // sessionStorage が使えない環境でも、現在の画面状態だけは進められるようにする。
  }
}
