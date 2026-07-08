import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AnalyticsApiError, fetchAnalytics } from "@/api/analyticsClient";
import { DashboardTop } from "@/features/dashboard";

const DASHBOARD_PERIOD_DAYS = 30;

function toJstDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function rangeForDays(offsetDays: number) {
  const toDate = new Date();
  toDate.setDate(toDate.getDate() - offsetDays);
  const fromDate = new Date(toDate.getTime() - (DASHBOARD_PERIOD_DAYS - 1) * 24 * 60 * 60 * 1000);
  return { from: toJstDateString(fromDate), to: toJstDateString(toDate) };
}

function analyticsErrorMessage(error: unknown) {
  if (error instanceof AnalyticsApiError) {
    return `${error.message}（HTTP ${error.status}）`;
  }
  return "分析データを読み込めませんでした。期間を変えるか、少し時間をおいて再読み込みしてください";
}

export const DashboardPage = () => {
  const range = useMemo(() => rangeForDays(0), []);
  const previousRange = useMemo(() => rangeForDays(DASHBOARD_PERIOD_DAYS), []);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("period");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, []);

  const overviewQuery = useQuery({
    queryKey: ["analytics", "overview", range.from, range.to],
    queryFn: () => fetchAnalytics({ kind: "overview", from: range.from, to: range.to }),
  });

  const previousOverviewQuery = useQuery({
    queryKey: ["analytics", "overview", previousRange.from, previousRange.to],
    queryFn: () => fetchAnalytics({ kind: "overview", from: previousRange.from, to: previousRange.to }),
  });

  const latestDate = overviewQuery.data?.data.latestServiceSnapshot?.date ?? range.to;
  const shopStagesQuery = useQuery({
    enabled: overviewQuery.isSuccess,
    queryKey: ["analytics", "shopStages", latestDate],
    queryFn: () => fetchAnalytics({ date: latestDate, kind: "shopStages" }),
  });

  const previousLatestDate = previousOverviewQuery.data?.data.latestServiceSnapshot?.date ?? null;
  const previousShopStagesQuery = useQuery({
    enabled: previousOverviewQuery.isSuccess && previousLatestDate !== null,
    queryKey: ["analytics", "shopStages", previousLatestDate],
    queryFn: () => fetchAnalytics({ date: previousLatestDate ?? "", kind: "shopStages" }),
  });
  const shopRecruitmentsQuery = useQuery({
    enabled: selectedShopId !== null,
    queryKey: ["analytics", "shopRecruitments", selectedShopId],
    queryFn: () => {
      if (selectedShopId === null) {
        throw new Error("店舗が選択されていません");
      }
      return fetchAnalytics({ kind: "shopRecruitments", shopId: selectedShopId });
    },
  });

  return (
    <DashboardTop
      env={overviewQuery.data?.env}
      errorMessage={overviewQuery.error ? analyticsErrorMessage(overviewQuery.error) : null}
      isLoading={overviewQuery.isLoading || shopStagesQuery.isLoading}
      latest={overviewQuery.data?.data.latestServiceSnapshot ?? null}
      onCloseShopRecruitments={() => setSelectedShopId(null)}
      onOpenShopRecruitments={setSelectedShopId}
      previousLatest={previousOverviewQuery.data?.data.latestServiceSnapshot ?? null}
      previousStages={previousShopStagesQuery.data?.data ?? null}
      previousTransitions={previousOverviewQuery.data?.data.stageTransitions ?? null}
      serviceSnapshots={overviewQuery.data?.data.serviceSnapshots ?? []}
      selectedShopId={selectedShopId}
      selectedShopRecruitments={shopRecruitmentsQuery.data?.data ?? null}
      selectedShopRecruitmentsErrorMessage={
        shopRecruitmentsQuery.error ? analyticsErrorMessage(shopRecruitmentsQuery.error) : null
      }
      selectedShopRecruitmentsLoading={shopRecruitmentsQuery.isLoading}
      stages={shopStagesQuery.data?.data ?? null}
      stagesErrorMessage={shopStagesQuery.error ? analyticsErrorMessage(shopStagesQuery.error) : null}
      transitions={overviewQuery.data?.data.stageTransitions ?? null}
    />
  );
};
