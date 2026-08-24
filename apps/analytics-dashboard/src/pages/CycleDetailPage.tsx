import { useQuery } from "@tanstack/react-query";
import { fetchCycle } from "@/api/analyticsClient";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { CycleDetailView } from "@/features/analytics/CycleDetailView";
import {
  AnalyticsEntityUnavailable,
  AnalyticsPageError,
  AnalyticsPageLoading,
  analyticsErrorMessage,
} from "@/features/analytics/PageState";
import { useAnalyticsSearch } from "@/features/analytics/useAnalyticsSearch";

export function CycleDetailPage({ recruitmentId, shopId }: { recruitmentId: string; shopId: string }) {
  const { search } = useAnalyticsSearch();
  const query = useQuery({
    queryFn: () => fetchCycle(shopId, recruitmentId, { planIdVersion: search.planIdVersion }),
    queryKey: ["analytics", "cycle", shopId, recruitmentId, search.planIdVersion],
  });
  useReportAnalyticsEnvironment(query.data?.env.label);
  if (query.isLoading)
    return <AnalyticsPageLoading description="シフト周期の集計値を読み込んでいます。" title="シフト周期詳細" />;
  if (query.error) {
    return (
      <AnalyticsPageError
        description="提出母集団、通知、確定結果を確認します。"
        message={analyticsErrorMessage(query.error)}
        title="シフト周期詳細"
      />
    );
  }
  if (!query.data) return null;
  const response = query.data.data;
  if (!response.cycle) {
    return (
      <AnalyticsEntityUnavailable
        description="提出母集団、通知、確定結果を確認します。"
        metadata={response.metadata}
        title="シフト周期詳細"
      />
    );
  }
  const cycle = response.cycle;
  return (
    <CycleDetailView
      model={{
        closedAt: cycle.closedAt,
        completeness: cycle.completeness,
        confirmedAt: cycle.confirmedAt,
        confirmedBeforeStart: cycle.confirmedBeforeStart,
        confirmationLeadTimeMs: cycle.confirmationLeadTimeMs,
        createdAt: cycle.createdAt,
        creationLeadTimeMs: cycle.creationLeadTimeMs,
        deadlineSubmissionRate: cycle.deadlineSubmission.rate,
        finalSubmissionRate: cycle.finalSubmission.rate,
        metadata: response.metadata,
        notificationFailedCount: cycle.notificationFailedCount,
        notificationSentCount: cycle.notificationSentCount,
        organizationId: cycle.organizationId,
        organizationName: cycle.organizationDisplayName,
        periodEnd: cycle.periodEnd,
        periodStart: cycle.periodStart,
        recruitmentId: cycle.recruitmentId,
        reminderSentCount: cycle.reminderSentCount,
        sequenceNumber: cycle.sequenceNumber,
        shopId: cycle.shopId,
        shopName: cycle.shopDisplayName,
        submitDeadlineAt: cycle.submitDeadlineAt,
        submittedAtClose: cycle.finalSubmission.numerator,
        submittedAtDeadline: cycle.deadlineSubmission.numerator,
        targetAtClose: cycle.finalSubmission.denominator,
        targetAtDeadline: cycle.deadlineSubmission.denominator,
      }}
    />
  );
}
