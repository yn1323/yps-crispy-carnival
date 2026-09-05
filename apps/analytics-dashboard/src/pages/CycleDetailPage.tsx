import { Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { AnalyticsApiError, fetchCycle } from "@/api/analyticsClient";
import { useReportAnalyticsEnvironment } from "@/app/analyticsEnvironment";
import { PageHeading } from "@/components/PageHeading";
import { formatDate, formatDateTime, formatDeadline, shopPath } from "@/features/analytics/format";
import { AnalyticsPageLoading, Details, Panel, QueryError } from "@/features/analytics/PageState";

export function CycleDetailPage({ shopId, recruitmentId }: { shopId: string; recruitmentId: string }) {
  const query = useQuery({
    queryKey: ["analytics", "cycle", shopId, recruitmentId],
    queryFn: ({ signal }) => fetchCycle(shopId, recruitmentId, signal),
  });
  useReportAnalyticsEnvironment(query.data?.env.label);
  const data = query.error instanceof AnalyticsApiError && query.error.status === 404 ? undefined : query.data?.data;
  if (!data && query.isPending)
    return <AnalyticsPageLoading title="募集詳細" description="現在の募集情報を読み込みます。" />;
  if (!data)
    return (
      <Stack gap={5}>
        <PageHeading
          title="募集詳細"
          description="現在の募集情報を確認します。"
          breadcrumbs={[
            { label: "店舗", href: "/shops" },
            { label: "店舗詳細", href: shopPath(shopId) },
          ]}
        />
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </Stack>
    );
  return (
    <Stack gap={6}>
      <PageHeading
        title={`${formatDate(data.cycle.periodStart)}〜${formatDate(data.cycle.periodEnd)}`}
        description={`募集詳細・${formatDateTime(data.asOf)}時点`}
        breadcrumbs={[
          { label: "店舗", href: "/shops" },
          { label: data.shop.name, href: shopPath(shopId) },
          { label: "募集詳細" },
        ]}
      />
      {query.error && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      <Panel title="募集情報">
        <Details
          items={[
            { label: "状態", value: data.cycle.status === "confirmed" ? "確定済み" : "未確定" },
            { label: "提出締切", value: formatDeadline(data.cycle.deadline) },
            { label: "確定日時", value: formatDateTime(data.cycle.confirmedAt) },
            {
              label: "開始前の確定",
              value:
                data.confirmedBeforeStart === null
                  ? "算出できません"
                  : data.confirmedBeforeStart
                    ? "開始前に確定"
                    : "開始時刻以降に確定",
            },
          ]}
        />
      </Panel>
      <Panel
        title="現在の提出状況"
        description="現在のシフト対象スタッフ数を分母にした値です。締切時点の提出率とは異なります。"
      >
        {data.currentSubmission ? (
          <Text fontSize="2xl" fontWeight="bold">
            {data.currentSubmission.numerator} / {data.currentSubmission.denominator}人{" "}
            <Text as="span" fontSize="sm" color="gray.600">
              {data.currentSubmission.rate === null
                ? "対象者なし"
                : new Intl.NumberFormat("ja-JP", { style: "percent", maximumFractionDigits: 1 }).format(
                    data.currentSubmission.rate,
                  )}
            </Text>
          </Text>
        ) : (
          <Text color="gray.600">対象人数が取得上限を超えているため、算出できません。</Text>
        )}
        <Text fontSize="sm" color="gray.600">
          締切時点の提出率：算出できません。締切時点の対象者集合が保存されていないため、現在の人数で代用しません。
        </Text>
      </Panel>
    </Stack>
  );
}
