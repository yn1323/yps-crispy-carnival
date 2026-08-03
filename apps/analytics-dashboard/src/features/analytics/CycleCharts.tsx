import { Grid } from "@chakra-ui/react";
import { ChartPanel } from "@/components/ChartPanel";
import { type ChartDatum, hasPlottableTrendData, TrendChart } from "@/components/TrendChart";
import { formatCount, formatDurationMs } from "./format";
import { DonutChart, HorizontalBarChart, partitionRemainder } from "./MetricVisualizations";
import type { CycleDetailViewModel, CycleRowViewModel } from "./viewModels";

const RATE_KEYS = ["期限内提出率", "最終提出率"];
const NOTIFICATION_KEYS = ["送信", "催促", "失敗"];

export function CycleListCharts({ rows }: { rows: CycleRowViewModel[] }) {
  const orderedRows = [...rows].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const rateData: ChartDatum[] = orderedRows.map((row) => ({
    date: row.periodStart,
    期限内提出率: row.completeness === "complete" ? row.deadlineSubmissionRate : null,
    最終提出率: row.completeness === "complete" ? row.finalSubmissionRate : null,
  }));
  const notificationData: ChartDatum[] = orderedRows.map((row) => ({
    date: row.periodStart,
    催促: row.completeness === "complete" ? row.reminderSentCount : null,
    失敗: row.completeness === "complete" ? row.notificationFailedCount : null,
    送信: row.completeness === "complete" ? row.notificationSentCount : null,
  }));
  const canPlotRates = hasPlottableTrendData(rateData, RATE_KEYS);
  const completeRows = orderedRows.filter((row) => row.completeness === "complete");
  const canPlotNotifications =
    completeRows.length >= 2 &&
    completeRows.some(
      (row) => (row.notificationSentCount ?? 0) + (row.reminderSentCount ?? 0) + (row.notificationFailedCount ?? 0) > 0,
    );

  if (!canPlotRates && !canPlotNotifications) return null;
  return (
    <Grid gap={4} templateColumns={{ base: "1fr", xl: "repeat(2, minmax(0, 1fr))" }}>
      {canPlotRates ? (
        <ChartPanel
          contentHeight={{ base: "240px", md: "300px" }}
          description="表示中の集計済み周期だけを、対象期間の開始日順に並べています。"
          title="周期別の提出率"
        >
          <TrendChart data={rateData} keys={RATE_KEYS} valueKind="percent" />
        </ChartPanel>
      ) : null}
      {canPlotNotifications ? (
        <ChartPanel
          contentHeight={{ base: "240px", md: "300px" }}
          description="送信・催促・最終失敗は意味が異なるため、積み上げず個別に表示します。"
          title="周期別の通知件数"
        >
          <TrendChart data={notificationData} keys={NOTIFICATION_KEYS} kind="bar" valueKind="count" />
        </ChartPanel>
      ) : null}
    </Grid>
  );
}

export function CycleSummaryCharts({ model }: { model: CycleDetailViewModel }) {
  const deadlineOutstandingCount = partitionRemainder(
    model.targetAtDeadline,
    model.submittedAtDeadline,
    model.completeness,
  );
  const finalOutstandingCount = partitionRemainder(model.targetAtClose, model.submittedAtClose, model.completeness);
  const canPlotDeadline =
    model.targetAtDeadline !== null && model.targetAtDeadline > 0 && deadlineOutstandingCount !== null;
  const canPlotFinal = model.targetAtClose !== null && model.targetAtClose > 0 && finalOutstandingCount !== null;
  const notificationOutcomeCount =
    model.completeness === "complete" && model.notificationSentCount !== null && model.notificationFailedCount !== null
      ? model.notificationSentCount + model.notificationFailedCount
      : null;
  const canPlotNotifications = notificationOutcomeCount !== null && notificationOutcomeCount > 0;
  const canPlotDurations =
    model.completeness === "complete" && (model.creationLeadTimeMs !== null || model.confirmationLeadTimeMs !== null);

  if (!canPlotDeadline && !canPlotFinal && !canPlotNotifications && !canPlotDurations) return null;
  return (
    <Grid gap={4} templateColumns={{ base: "1fr", xl: "repeat(2, minmax(0, 1fr))" }}>
      {canPlotDeadline ? (
        <ChartPanel
          contentHeight="auto"
          description="提出期限の時点で、対象者を提出済みと未提出に分けています。"
          title="期限時点の提出状況"
        >
          <DonutChart
            ariaLabel="提出期限時点の提出済みと未提出の構成比"
            centerLabel="対象者"
            centerValue={`${formatCount(model.targetAtDeadline, model.completeness)}人`}
            items={[
              {
                color: "blue.500",
                completeness: model.completeness,
                displayValue: `${formatCount(model.submittedAtDeadline, model.completeness)}人`,
                key: "submitted",
                label: "提出済み",
                value: model.submittedAtDeadline,
              },
              {
                color: "gray.500",
                completeness: model.completeness,
                displayValue: `${formatCount(deadlineOutstandingCount, model.completeness)}人`,
                key: "outstanding",
                label: "未提出",
                value: deadlineOutstandingCount,
              },
            ]}
          />
        </ChartPanel>
      ) : null}
      {canPlotFinal ? (
        <ChartPanel
          contentHeight="auto"
          description="周期終了時点で、対象者を提出済みと未提出に分けています。"
          title="最終提出状況"
        >
          <DonutChart
            ariaLabel="周期終了時点の提出済みと未提出の構成比"
            centerLabel="対象者"
            centerValue={`${formatCount(model.targetAtClose, model.completeness)}人`}
            items={[
              {
                color: "green.500",
                completeness: model.completeness,
                displayValue: `${formatCount(model.submittedAtClose, model.completeness)}人`,
                key: "submitted",
                label: "提出済み",
                value: model.submittedAtClose,
              },
              {
                color: "gray.500",
                completeness: model.completeness,
                displayValue: `${formatCount(finalOutstandingCount, model.completeness)}人`,
                key: "outstanding",
                label: "未提出",
                value: finalOutstandingCount,
              },
            ]}
          />
        </ChartPanel>
      ) : null}
      {canPlotNotifications ? (
        <ChartPanel
          contentHeight="auto"
          description="送信結果を成功と最終失敗に分けています。催促は送信成功の内訳なので円には含めません。"
          title="通知結果"
        >
          <DonutChart
            ariaLabel="通知の送信成功と最終失敗の構成比"
            centerLabel="送信結果"
            centerValue={`${formatCount(notificationOutcomeCount, model.completeness)}件`}
            items={[
              {
                color: "green.500",
                completeness: model.completeness,
                displayValue: `${formatCount(model.notificationSentCount, model.completeness)}件`,
                key: "sent",
                label: "送信成功",
                value: model.notificationSentCount,
              },
              {
                color: "orange.500",
                completeness: model.completeness,
                displayValue: `${formatCount(model.notificationFailedCount, model.completeness)}件`,
                key: "failed",
                label: "最終失敗",
                value: model.notificationFailedCount,
              },
            ]}
          />
        </ChartPanel>
      ) : null}
      {canPlotDurations ? (
        <ChartPanel
          contentHeight="auto"
          description="同じ時間尺度で、作成と確定に要した時間を比較します。"
          title="周期の所要時間"
        >
          <HorizontalBarChart
            ariaLabel="作成までと確定までの所要時間"
            items={[
              {
                color: "gray.500",
                completeness: model.completeness,
                displayValue: formatDurationMs(model.creationLeadTimeMs, model.completeness),
                key: "creation",
                label: "作成まで",
                value: model.creationLeadTimeMs,
              },
              {
                color: "teal.500",
                completeness: model.completeness,
                displayValue: formatDurationMs(model.confirmationLeadTimeMs, model.completeness),
                key: "confirmation",
                label: "確定まで",
                value: model.confirmationLeadTimeMs,
              },
            ]}
            valueKind="duration"
          />
        </ChartPanel>
      ) : null}
    </Grid>
  );
}
