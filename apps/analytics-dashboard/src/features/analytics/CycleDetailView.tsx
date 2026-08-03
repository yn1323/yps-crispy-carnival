import { Badge, Box, Grid, HStack, Stack, Text } from "@chakra-ui/react";
import { KpiCard } from "@/components/KpiCard";
import { PageHeading, SectionHeading } from "@/components/PageHeading";
import { routePath, withCurrentSearch } from "@/routes/appRoute";
import { CompletenessBadge, DataStatus } from "./DataStatus";
import { formatCount, formatDateTime, formatDurationMs, formatRate } from "./format";
import type { CycleDetailViewModel } from "./viewModels";

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text color="gray.500" fontSize="xs" fontWeight="bold">
        {label}
      </Text>
      <Text fontSize="sm" fontWeight="semibold" mt={1}>
        {value}
      </Text>
    </Box>
  );
}

export function CycleDetailView({ model }: { model: CycleDetailViewModel }) {
  const deadlinePair = `${formatCount(model.submittedAtDeadline, model.completeness)} / ${formatCount(model.targetAtDeadline, model.completeness)}`;
  const finalPair = `${formatCount(model.submittedAtClose, model.completeness)} / ${formatCount(model.targetAtClose, model.completeness)}`;
  const confirmationTiming =
    model.completeness === "complete"
      ? model.confirmedBeforeStart === null
        ? "算出できません"
        : model.confirmedBeforeStart
          ? "開始前に確定"
          : "開始後に確定"
      : formatCount(undefined, model.completeness);
  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <PageHeading
        breadcrumbs={[
          { href: withCurrentSearch(routePath({ name: "shops" })), label: "店舗" },
          { href: withCurrentSearch(routePath({ name: "shop", shopId: model.shopId })), label: model.shopName },
          { label: `${model.periodStart} 〜 ${model.periodEnd}` },
        ]}
        description="一つのシフト周期の提出母集団、通知、確定結果を個人情報なしで確認します。"
        title={`${model.periodStart} 〜 ${model.periodEnd}`}
      />
      <DataStatus metadata={model.metadata} />

      <HStack gap={2} wrap="wrap">
        {model.completeness !== "complete" ? (
          <HStack gap={1}>
            <Text color="gray.500" fontSize="xs">
              この周期の集計:
            </Text>
            <CompletenessBadge value={model.completeness} />
          </HStack>
        ) : null}
        <Badge variant="surface">{model.organizationName}</Badge>
        <Badge variant="surface">{model.shopName}</Badge>
        {model.sequenceNumber !== null ? <Badge variant="surface">第{model.sequenceNumber}周期</Badge> : null}
      </HStack>

      <Grid gap={4} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }}>
        <KpiCard
          accent="blue"
          helper={deadlinePair}
          label="期限内提出率"
          value={formatRate(model.deadlineSubmissionRate, model.completeness)}
        />
        <KpiCard
          accent="teal"
          helper={finalPair}
          label="最終提出率"
          value={formatRate(model.finalSubmissionRate, model.completeness)}
        />
        <KpiCard
          accent={model.completeness === "complete" ? (model.notificationFailedCount ? "orange" : "green") : "gray"}
          helper={`送信 ${formatCount(model.notificationSentCount, model.completeness)} / 催促 ${formatCount(model.reminderSentCount, model.completeness)}`}
          label="通知失敗"
          value={formatCount(model.notificationFailedCount, model.completeness)}
        />
        <KpiCard
          accent="gray"
          helper={confirmationTiming}
          label="確定までの時間"
          value={formatDurationMs(model.confirmationLeadTimeMs, model.completeness)}
        />
      </Grid>

      <Stack bg="white" border="1px solid" borderColor="gray.200" borderRadius="lg" gap={5} p={{ base: 4, md: 5 }}>
        <SectionHeading
          description="表示するのは周期の集計値だけで、氏名・連絡先・提出内容は含みません。"
          title="周期の基準時刻"
        />
        <Grid gap={5} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }}>
          <DetailItem label="作成日時" value={formatDateTime(model.createdAt)} />
          <DetailItem label="提出期限" value={formatDateTime(model.submitDeadlineAt)} />
          <DetailItem label="確定日時" value={model.confirmedAt ? formatDateTime(model.confirmedAt) : "未確定"} />
          <DetailItem label="周期終了" value={model.closedAt ? formatDateTime(model.closedAt) : "未完了"} />
          <DetailItem label="作成までの時間" value={formatDurationMs(model.creationLeadTimeMs, model.completeness)} />
          <DetailItem
            label="確定までの時間"
            value={formatDurationMs(model.confirmationLeadTimeMs, model.completeness)}
          />
          <DetailItem label="期限時 提出 / 対象" value={deadlinePair} />
          <DetailItem label="最終 提出 / 対象" value={finalPair} />
        </Grid>
      </Stack>
    </Stack>
  );
}
