import type {
  AnalyticsCadenceDto,
  AnalyticsCycleRowDto,
  AnalyticsHealthSignalCountsDto,
  AnalyticsMilestoneCountsDto,
  AnalyticsMilestoneDatesDto,
  AnalyticsMilestoneRatesDto,
  AnalyticsOrganizationKpiDto,
  AnalyticsOrganizationRowDto,
  AnalyticsResponseCompleteness,
  AnalyticsResponseMetadata,
  AnalyticsSegmentRowDto,
  AnalyticsServiceKpiSnapshotDto,
  AnalyticsShopKpiDto,
  AnalyticsShopRowDto,
  AnalyticsTrendMetric,
  AnalyticsTrendPointDto,
} from "@/api/analyticsTypes";
import { formatCount, formatCountWithUnit, formatDurationMs, formatPlan, formatRate } from "./format";
import type {
  CycleRowViewModel,
  HealthViewModel,
  KpiViewModel,
  OrganizationRowViewModel,
  SegmentRowViewModel,
  ShopRowViewModel,
} from "./viewModels";

const MILESTONES = [
  ["registered", "店舗登録"],
  ["firstRecruitment", "初回募集"],
  ["firstSubmission", "初回提出"],
  ["firstConfirmed", "初回確定"],
  ["secondConfirmed", "2回目確定"],
] as const;

const HEALTH_KEYS = [
  "hasUpcomingCycle",
  "nextCycleMissing",
  "cadenceDelayed",
  "notificationFailure",
  "submissionDrop",
  "confirmationDelay",
  "longInactive",
  "insufficientData",
] as const;

const TREND_LABELS: Record<AnalyticsTrendMetric, string> = {
  activeShopCount: "稼働店舗数",
  deadlineSubmissionRate: "期限内提出率",
  finalSubmissionRate: "最終提出率",
  managerStaffCount: "管理者兼スタッフ数",
  managerMembershipCount: "管理者所属数",
  northStarRate: "開始前確定周期率",
  organizationCount: "グループ数",
  personCount: "重複を除いた利用者数",
  kpiEligibleShopCount: "KPI対象店舗数",
  shiftTargetCount: "シフト対象人数",
  shopCount: "店舗数",
  staffMembershipCount: "スタッフ所属数",
  unlinkedStaffCount: "重複判定できないスタッフ数",
};

const SEGMENT_DIMENSION_LABELS: Record<string, string> = {
  adoptionAge: "導入時期",
  cadence: "通常周期",
  lineUsage: "LINE利用",
  organizationShopCount: "グループ店舗数",
  plan: "プラン",
  registrationCohort: "登録時期",
  shopStaffSize: "店舗スタッフ規模",
  submissionTrend: "最近の提出傾向",
};

const SEGMENT_BUCKET_LABELS: Record<string, string> = {
  biweekly: "隔週",
  high: "高位",
  insufficientData: "判定材料不足",
  low: "低位",
  medium: "中位",
  monthly: "月次",
  none: "0%",
  other: "その他",
  stable: "安定",
  weekly: "週次",
};

export const RATE_TREND_METRICS = ["northStarRate", "deadlineSubmissionRate", "finalSubmissionRate"] as const;

export const RATE_TREND_LABELS = RATE_TREND_METRICS.map((metric) => TREND_LABELS[metric]);

function kpi(
  key: string,
  label: string,
  value: string,
  detail: string,
  completeness: AnalyticsResponseCompleteness,
  currentValue: number | null,
  comparisonValue: number | null,
  options: Pick<KpiViewModel, "accent" | "comparisonEnabled" | "deltaSuffix"> = {},
): KpiViewModel {
  return {
    ...options,
    comparable: comparisonValue !== null,
    completeness,
    delta: currentValue !== null && comparisonValue !== null ? currentValue - comparisonValue : null,
    detail,
    key,
    label,
    value,
  };
}

export function metadataModel(metadata: AnalyticsResponseMetadata) {
  return metadata;
}

export function serviceKpis(
  current: AnalyticsServiceKpiSnapshotDto | null,
  comparison: AnalyticsServiceKpiSnapshotDto | null,
  fallbackCompleteness: AnalyticsResponseCompleteness,
): KpiViewModel[] {
  // requested rangeがwatermark外へはみ出す場合は、取得できた行自体がcompleteでも
  // 期間全体の値としてはpartial/unavailableなのでresponse metadataを優先する。
  const rateCompleteness =
    fallbackCompleteness === "complete" ? (current?.completeness ?? "unavailable") : fallbackCompleteness;
  // 店舗数は期間集計ではなく、選択期間内の最新snapshot時点の値として返される。
  // 比較期間が欠けていても、current snapshot自体が完全なら現在値は表示できる。
  const countCompleteness = current?.completeness ?? "unavailable";
  const noCompleteCycleDetail =
    current?.completeness === "complete" && current.northStar.denominator === 0
      ? "集計対象となる完全な周期がまだありません"
      : null;
  const comparable = fallbackCompleteness === "complete" && comparison?.completeness === "complete";
  return [
    kpi(
      "northStar",
      "開始前確定周期率",
      formatRate(current?.northStar.rate, rateCompleteness),
      noCompleteCycleDetail ??
        `${formatCount(current?.northStar.numerator, rateCompleteness)} / ${formatCountWithUnit(current?.northStar.denominator, "周期", rateCompleteness)}`,
      rateCompleteness,
      current?.northStar.rate ?? null,
      comparable ? (comparison?.northStar.rate ?? null) : null,
      { accent: "teal", deltaSuffix: "pt", comparisonEnabled: comparable },
    ),
    kpi(
      "deadlineSubmission",
      "期限内提出率",
      formatRate(current?.deadlineSubmission.rate, rateCompleteness),
      noCompleteCycleDetail ??
        `${formatCount(current?.deadlineSubmission.numerator, rateCompleteness)} / ${formatCountWithUnit(current?.deadlineSubmission.denominator, "人", rateCompleteness)}`,
      rateCompleteness,
      current?.deadlineSubmission.rate ?? null,
      comparable ? (comparison?.deadlineSubmission.rate ?? null) : null,
      { accent: "blue", deltaSuffix: "pt", comparisonEnabled: comparable },
    ),
    kpi(
      "finalSubmission",
      "最終提出率",
      formatRate(current?.finalSubmission.rate, rateCompleteness),
      noCompleteCycleDetail ??
        `${formatCount(current?.finalSubmission.numerator, rateCompleteness)} / ${formatCountWithUnit(current?.finalSubmission.denominator, "人", rateCompleteness)}`,
      rateCompleteness,
      current?.finalSubmission.rate ?? null,
      comparable ? (comparison?.finalSubmission.rate ?? null) : null,
      { accent: "green", deltaSuffix: "pt", comparisonEnabled: comparable },
    ),
    kpi(
      "activeShops",
      "稼働店舗数",
      formatCountWithUnit(current?.counts.activeShopCount, "店舗", countCompleteness),
      `全 ${formatCountWithUnit(current?.counts.shopCount, "店舗", countCompleteness)}`,
      countCompleteness,
      current?.counts.activeShopCount ?? null,
      comparable ? (comparison?.counts.activeShopCount ?? null) : null,
      { accent: "orange", deltaSuffix: "店舗", comparisonEnabled: comparable },
    ),
    kpi(
      "kpiEligibleShops",
      "KPI対象店舗数",
      formatCountWithUnit(current?.counts.kpiEligibleShopCount, "店舗", countCompleteness),
      `全 ${formatCountWithUnit(current?.counts.shopCount, "店舗", countCompleteness)}`,
      countCompleteness,
      current?.counts.kpiEligibleShopCount ?? null,
      comparable ? (comparison?.counts.kpiEligibleShopCount ?? null) : null,
      { accent: "blue", deltaSuffix: "店舗", comparisonEnabled: comparable },
    ),
  ];
}

export function milestoneItems(
  counts: AnalyticsMilestoneCountsDto | null,
  rates: AnalyticsMilestoneRatesDto | null,
  completeness: AnalyticsResponseCompleteness,
) {
  return MILESTONES.map(([key, label]) => ({
    completeness,
    key,
    label,
    previousStepConversionRate: key === "registered" ? undefined : (rates?.[key].previousStepConversion.rate ?? null),
    rate: rates?.[key].reach.rate ?? null,
    reachedCount: counts?.[key] ?? null,
  }));
}

export function milestoneDateItems(dates: AnalyticsMilestoneDatesDto) {
  return MILESTONES.map(([key, label]) => {
    const field = `${key}At` as keyof AnalyticsMilestoneDatesDto;
    return { key, label, reachedAt: dates[field] };
  });
}

export function healthCountItems(
  counts: AnalyticsHealthSignalCountsDto | null,
  comparison?: AnalyticsHealthSignalCountsDto | null,
): HealthViewModel[] {
  if (!counts) return [];
  return HEALTH_KEYS.filter((key) => counts[key] > 0 || (comparison?.[key] ?? 0) > 0).map((key) => ({
    count: counts[key],
    delta: comparison ? counts[key] - comparison[key] : null,
    key,
  }));
}

export function segmentRowModel(row: AnalyticsSegmentRowDto): SegmentRowViewModel {
  return {
    bucket: SEGMENT_BUCKET_LABELS[row.bucket] ?? row.bucket,
    completeness: row.completeness,
    deadlineSubmissionRate: row.deadlineSubmission.rate,
    dimension: SEGMENT_DIMENSION_LABELS[row.dimension] ?? row.dimension,
    finalSubmissionRate: row.finalSubmission.rate,
    healthCompleteness: row.completeness,
    healthSignals: healthCountItems(row.healthSignalCounts),
    northStarRate: row.northStar.rate,
    secondConfirmedCount: row.milestoneCounts.secondConfirmed,
    shopCount: row.shopCount,
  };
}

export function organizationRowModel(row: AnalyticsOrganizationRowDto): OrganizationRowViewModel {
  const completeness = row.kpis?.completeness ?? "unavailable";
  return {
    activeShopCount: row.kpis?.activeShopCount ?? null,
    completeness,
    displayName: row.displayName,
    healthCompleteness: completeness,
    healthSignals: healthCountItems(row.kpis?.healthSignalCounts ?? null),
    managerCount: row.kpis?.managerMembershipCount ?? null,
    managerStaffCount: row.kpis?.managerStaffCount ?? null,
    northStarRate: row.kpis?.northStar.rate ?? null,
    organizationId: row.organizationId,
    plan: formatPlan(row.currentPlan),
    shiftTargetCount: row.kpis?.shiftTargetCount ?? null,
    shopCount: row.kpis?.shopCount ?? null,
    staffMembershipCount: row.kpis?.staffMembershipCount ?? null,
    unlinkedStaffCount: row.kpis?.unlinkedStaffCount ?? null,
    uniquePersonCount: row.kpis?.uniquePersonCount ?? null,
  };
}

function latestMilestoneLabel(dates: AnalyticsMilestoneDatesDto) {
  if (dates.secondConfirmedAt) return "2回目確定";
  if (dates.firstConfirmedAt) return "初回確定";
  if (dates.firstSubmissionAt) return "初回提出";
  if (dates.firstRecruitmentAt) return "初回募集";
  return "店舗登録";
}

export function shopRowModel(row: AnalyticsShopRowDto): ShopRowViewModel {
  const completeness = row.kpis?.completeness ?? "unavailable";
  return {
    activeStaffCount: row.kpis?.staffMembershipCount ?? null,
    completeness,
    deadlineSubmissionRate: row.kpis?.deadlineSubmission.rate ?? null,
    displayName: row.displayName,
    estimatedCadenceDays: row.cadence.estimatedDays,
    finalSubmissionRate: row.kpis?.finalSubmission.rate ?? null,
    healthCompleteness: completeness,
    healthSignals: row.kpis?.healthSignals.map((signal) => ({ key: signal.signal, startedAt: signal.startedAt })) ?? [],
    latestActivityAt: row.latestActivityAt,
    lineLinkedRate: row.kpis?.lineLinkedRate ?? null,
    managerCount: row.kpis?.managerMembershipCount ?? null,
    managerStaffCount: row.kpis?.managerStaffCount ?? null,
    milestoneLabel: latestMilestoneLabel(row.milestoneDates),
    nextCycleDate: row.nextCyclePeriodStart,
    organizationId: row.organizationId,
    organizationName: row.organizationDisplayName,
    plan: formatPlan(row.currentPlan),
    registeredAt: row.registeredAt,
    shiftTargetCount: row.kpis?.shiftTargetCount ?? null,
    shopId: row.shopId,
    unlinkedStaffCount: row.kpis?.unlinkedStaffCount ?? null,
    uniquePersonCount: row.kpis?.uniquePersonCount ?? null,
  };
}

export function cycleRowModel(row: AnalyticsCycleRowDto): CycleRowViewModel {
  return {
    completeness: row.completeness,
    confirmedAt: row.confirmedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    deadlineSubmissionRate: row.deadlineSubmission.rate,
    finalSubmissionRate: row.finalSubmission.rate,
    notificationFailedCount: row.notificationFailedCount,
    notificationSentCount: row.notificationSentCount,
    periodEnd: row.periodEnd,
    periodStart: row.periodStart,
    recruitmentId: row.recruitmentId,
    reminderSentCount: row.reminderSentCount,
    submitDeadlineAt: row.submitDeadlineAt,
    submittedAtClose: row.finalSubmission.numerator,
    submittedAtDeadline: row.deadlineSubmission.numerator,
    targetAtClose: row.finalSubmission.denominator,
    targetAtDeadline: row.deadlineSubmission.denominator,
  };
}

export function trendChartData(points: AnalyticsTrendPointDto[], metrics: AnalyticsTrendMetric[]) {
  return points.map((point) => {
    const datum: Record<string, string | number | null> = { date: point.date };
    for (const metric of metrics) {
      datum[TREND_LABELS[metric]] = point.completeness === "complete" ? (point.values[metric]?.value ?? null) : null;
    }
    return datum;
  });
}

export function organizationTrendChartData(series: AnalyticsOrganizationKpiDto[]) {
  return series.map((point) => ({
    date: point.snapshotDate,
    期限内提出率: point.completeness === "complete" ? point.deadlineSubmission.rate : null,
    最終提出率: point.completeness === "complete" ? point.finalSubmission.rate : null,
    開始前確定周期率: point.completeness === "complete" ? point.northStar.rate : null,
  }));
}

export function shopTrendChartData(series: AnalyticsShopKpiDto[]) {
  return series.map((point) => ({
    date: point.snapshotDate,
    期限内提出率: point.completeness === "complete" ? point.deadlineSubmission.rate : null,
    最終提出率: point.completeness === "complete" ? point.finalSubmission.rate : null,
    開始前確定周期率: point.completeness === "complete" ? point.northStar.rate : null,
  }));
}

export function organizationKpis(
  kpis: AnalyticsOrganizationKpiDto | null,
  fallbackCompleteness: AnalyticsResponseCompleteness,
): KpiViewModel[] {
  const completeness = kpis?.completeness ?? fallbackCompleteness;
  const values = [
    ["shops", "店舗数", kpis?.shopCount, "店舗"],
    ["kpiEligibleShops", "KPI対象店舗数", kpis?.kpiEligibleShopCount, "店舗"],
    ["activeShops", "稼働店舗数", kpis?.activeShopCount, "店舗"],
    ["people", "重複を除いた利用者", kpis?.uniquePersonCount, "人"],
    ["staff", "スタッフ所属数", kpis?.staffMembershipCount, "件"],
    ["unlinkedStaff", "重複判定できないスタッフ", kpis?.unlinkedStaffCount, "件"],
    ["targets", "シフト対象人数", kpis?.shiftTargetCount, "人"],
    ["managers", "管理者所属数", kpis?.managerMembershipCount, "件"],
    ["managerStaff", "管理者兼スタッフ数", kpis?.managerStaffCount, "人"],
  ] as const;
  return values.map(([key, label, value, unit]) =>
    kpi(key, label, formatCountWithUnit(value, unit, completeness), "現在値", completeness, value ?? null, null, {
      accent: "blue",
      deltaSuffix: unit,
    }),
  );
}

function nonNegativeDurationMs(startAt: number | null, endAt: number | null) {
  if (startAt === null || endAt === null || !Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) {
    return null;
  }
  return endAt - startAt;
}

export function organizationExpansionKpis(
  organization: Pick<
    AnalyticsOrganizationRowDto,
    "registeredAt" | "firstShopAt" | "secondShopAt" | "secondShopFirstConfirmedAt"
  >,
): KpiViewModel[] {
  const expansionStartAt = organization.firstShopAt ?? organization.registeredAt;
  const secondShopDuration = nonNegativeDurationMs(expansionStartAt, organization.secondShopAt);
  const secondShopFirstConfirmedDuration = nonNegativeDurationMs(
    organization.secondShopAt,
    organization.secondShopFirstConfirmedAt,
  );
  return [
    kpi(
      "secondShopDuration",
      "2店舗目まで",
      formatDurationMs(secondShopDuration),
      `${organization.firstShopAt === null ? "グループ登録" : "初店舗登録"}から2店舗目登録まで`,
      "complete",
      secondShopDuration,
      null,
      { accent: "orange" },
    ),
    kpi(
      "secondShopFirstConfirmedDuration",
      "2店舗目初回確定まで",
      formatDurationMs(secondShopFirstConfirmedDuration),
      "2店舗目登録から、その店舗の初回シフト確定まで",
      "complete",
      secondShopFirstConfirmedDuration,
      null,
      { accent: "green" },
    ),
  ];
}

export function shopCurrentKpis(
  kpis: AnalyticsShopKpiDto | null,
  fallbackCompleteness: AnalyticsResponseCompleteness,
): KpiViewModel[] {
  const completeness = kpis?.completeness ?? fallbackCompleteness;
  const values = [
    ["staff", "スタッフ所属数", kpis?.staffMembershipCount, "人"],
    ["unlinkedStaff", "重複判定できないスタッフ", kpis?.unlinkedStaffCount, "人"],
    ["targets", "シフト対象人数", kpis?.shiftTargetCount, "人"],
    ["people", "重複を除いた利用者", kpis?.uniquePersonCount, "人"],
    ["managers", "管理者所属数", kpis?.managerMembershipCount, "件"],
    ["managerStaff", "管理者兼スタッフ数", kpis?.managerStaffCount, "人"],
  ] as const;
  const result = values.map(([key, label, value, unit]) =>
    kpi(key, label, formatCountWithUnit(value, unit, completeness), "現在値", completeness, value ?? null, null, {
      accent: "blue",
      deltaSuffix: unit,
    }),
  );
  result.push(
    kpi(
      "lineLinked",
      "LINE連携",
      formatCountWithUnit(kpis?.lineLinkedCount, "人", completeness),
      `連携率 ${formatRate(kpis?.lineLinkedRate, completeness)} / フォロー中 ${formatCountWithUnit(kpis?.lineFollowingCount, "人", completeness)}`,
      completeness,
      kpis?.lineLinkedCount ?? null,
      null,
      { accent: "green", deltaSuffix: "人" },
    ),
  );
  return result;
}

export function shopCadenceKpi(
  cadence: AnalyticsCadenceDto,
  completeness: AnalyticsResponseCompleteness,
): KpiViewModel {
  const confidenceLabel = {
    high: "判定精度 高",
    insufficientData: "判定材料不足",
    low: "判定精度 低",
    medium: "判定精度 中",
  }[cadence.confidence];
  return kpi(
    "cadence",
    "通常周期",
    completeness === "complete"
      ? cadence.estimatedDays === null
        ? "判定材料不足"
        : `${cadence.estimatedDays}日`
      : formatCount(undefined, completeness),
    confidenceLabel,
    completeness,
    cadence.estimatedDays,
    null,
    { accent: "gray" },
  );
}

export function shopCumulativeKpis(
  kpis: AnalyticsShopKpiDto | null,
  fallbackCompleteness: AnalyticsResponseCompleteness,
): KpiViewModel[] {
  const completeness = kpis?.completeness ?? fallbackCompleteness;
  return [
    kpi(
      "cycles",
      "累積シフト周期",
      formatCountWithUnit(kpis?.cycleCountAsOfSnapshot, "周期", completeness),
      "最新の集計日時点で作成済みのシフト周期",
      completeness,
      kpis?.cycleCountAsOfSnapshot ?? null,
      null,
      { accent: "gray", deltaSuffix: "周期" },
    ),
    kpi(
      "confirmed",
      "累積確定周期",
      formatCountWithUnit(kpis?.confirmedCycleCountAsOfSnapshot, "周期", completeness),
      "最新の集計日時点で確定済みのシフト周期",
      completeness,
      kpis?.confirmedCycleCountAsOfSnapshot ?? null,
      null,
      { accent: "green", deltaSuffix: "周期" },
    ),
    kpi(
      "beforeStart",
      "累積開始前確定周期",
      formatCountWithUnit(kpis?.confirmedBeforeStartCycleCountAsOfSnapshot, "周期", completeness),
      "最新の集計日時点で開始前に確定したシフト周期",
      completeness,
      kpis?.confirmedBeforeStartCycleCountAsOfSnapshot ?? null,
      null,
      { accent: "teal", deltaSuffix: "周期" },
    ),
    kpi(
      "cumulativeDeadlineSubmission",
      "累積期限内提出率",
      formatRate(kpis?.cumulativeDeadlineSubmission.rate, completeness),
      `提出 ${formatCount(kpis?.cumulativeDeadlineSubmission.numerator, completeness)} / 対象 ${formatCountWithUnit(kpis?.cumulativeDeadlineSubmission.denominator, "人", completeness)}`,
      completeness,
      kpis?.cumulativeDeadlineSubmission.rate ?? null,
      null,
      { accent: "blue", deltaSuffix: "pt" },
    ),
    kpi(
      "cumulativeFinalSubmission",
      "累積最終提出率",
      formatRate(kpis?.cumulativeFinalSubmission.rate, completeness),
      `提出 ${formatCount(kpis?.cumulativeFinalSubmission.numerator, completeness)} / 対象 ${formatCountWithUnit(kpis?.cumulativeFinalSubmission.denominator, "人", completeness)}`,
      completeness,
      kpis?.cumulativeFinalSubmission.rate ?? null,
      null,
      { accent: "green", deltaSuffix: "pt" },
    ),
    kpi(
      "cumulativeNotificationSent",
      "累積通知送信",
      formatCountWithUnit(kpis?.cumulativeNotificationSentCount, "件", completeness),
      "最新の集計日時までの通知送信数",
      completeness,
      kpis?.cumulativeNotificationSentCount ?? null,
      null,
      { accent: "blue", deltaSuffix: "件" },
    ),
    kpi(
      "cumulativeNotificationFailed",
      "累積通知失敗",
      formatCountWithUnit(kpis?.cumulativeNotificationFailedCount, "件", completeness),
      "最新の集計日時までの最終失敗数",
      completeness,
      kpis?.cumulativeNotificationFailedCount ?? null,
      null,
      { accent: "orange", deltaSuffix: "件" },
    ),
    kpi(
      "confirmationLeadTimeMedian",
      "確定までの時間 中央値",
      formatDurationMs(kpis?.confirmationLeadTimeMedianMs, completeness),
      "シフト作成から確定までの中央値",
      completeness,
      kpis?.confirmationLeadTimeMedianMs ?? null,
      null,
      { accent: "teal" },
    ),
    kpi(
      "confirmationLeadTimeP90",
      "確定までの時間 P90",
      formatDurationMs(kpis?.confirmationLeadTimeP90Ms, completeness),
      "シフト作成から確定までの90パーセンタイル",
      completeness,
      kpis?.confirmationLeadTimeP90Ms ?? null,
      null,
      { accent: "gray" },
    ),
  ];
}

export function shopPeriodRateKpis(
  kpis: AnalyticsShopKpiDto | null,
  fallbackCompleteness: AnalyticsResponseCompleteness,
): KpiViewModel[] {
  const completeness = kpis?.completeness ?? fallbackCompleteness;
  return [
    kpi(
      "deadline",
      "期限内 提出 / 対象",
      `${formatCount(kpis?.deadlineSubmission.numerator, completeness)} / ${formatCount(kpis?.deadlineSubmission.denominator, completeness)}`,
      formatRate(kpis?.deadlineSubmission.rate, completeness),
      completeness,
      kpis?.deadlineSubmission.rate ?? null,
      null,
      { accent: "blue", deltaSuffix: "pt" },
    ),
    kpi(
      "final",
      "最終 提出 / 対象",
      `${formatCount(kpis?.finalSubmission.numerator, completeness)} / ${formatCount(kpis?.finalSubmission.denominator, completeness)}`,
      formatRate(kpis?.finalSubmission.rate, completeness),
      completeness,
      kpis?.finalSubmission.rate ?? null,
      null,
      { accent: "green", deltaSuffix: "pt" },
    ),
  ];
}
