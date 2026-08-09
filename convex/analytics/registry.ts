export type AnalyticsKpiDefinition = {
  key: string;
  granularity: readonly ("service" | "organization" | "shop" | "segment" | "cycle")[];
  numerator: string;
  denominator: string;
  timeBasis: "occurredAt" | "effectiveAt" | "cutoffAt" | "snapshotDate";
  excludes: string;
  incomplete: "excludeFromRate" | "showAsUnavailable";
};

// 集計式と同様に、health判定・retention・1 transactionの上限もここを正本にする。
export const ANALYTICS_POLICY = {
  batch: {
    sourceEvents: 50,
    scopedAggregation: 50,
    segmentRollup: 5,
    cleanup: 50,
    // 一店舗・一組織を一transactionで正確に集計する際のhard cap。
    // 超過時は不完全値を保存せず、その日のrunをfailedにする。
    scopeReadLimit: 500,
  },
  health: {
    activityWindowDays: 30,
    notificationFailureWindowDays: 30,
    submissionDropMinimumTargets: 5,
    submissionDropThresholdPoints: 0.15,
    cadenceHistoryCycles: 6,
    cadenceToleranceMinimumDays: 3,
    cadenceToleranceRatio: 0.2,
  },
  retention: {
    sourceEventsDays: 90,
    opportunityDays: 400,
    detailMonths: 25,
    serviceYears: 5,
    failedOutputDays: 14,
    runManifestYears: 5,
  },
  runs: {
    staleDailyHours: 12,
    staleResetHours: 12,
    staleMaintenanceHours: 24,
  },
} as const;

// KPIの式をUIや各集計phaseへ分散させないための唯一のregistry。
export const ANALYTICS_KPI_REGISTRY = {
  confirmedBeforeStartCycleRate: {
    key: "confirmedBeforeStartCycleRate",
    granularity: ["service", "organization", "shop", "segment"],
    numerator: "periodStartが期間内かつconfirmedAt <= periodStartのcomplete cycle数",
    denominator: "periodStartが期間内の非削除complete cycle数",
    timeBasis: "snapshotDate",
    excludes: "partialまたはunavailable cycle、削除cycle",
    incomplete: "excludeFromRate",
  },
  deadlineSubmissionRate: {
    key: "deadlineSubmissionRate",
    granularity: ["service", "organization", "shop", "segment", "cycle"],
    numerator: "submitDeadline cutoffまでに初回提出したopportunity数",
    denominator: "cutoff時点のshift targetとcutoffまでの提出者の和集合",
    timeBasis: "cutoffAt",
    excludes: "deadline opportunityがcompleteでないcycle",
    incomplete: "showAsUnavailable",
  },
  finalSubmissionRate: {
    key: "finalSubmissionRate",
    granularity: ["service", "organization", "shop", "segment", "cycle"],
    numerator: "confirmedAt（未確定はperiodStart）までに初回提出したopportunity数",
    denominator: "close時点のshift targetとcloseまでの提出者の和集合",
    timeBasis: "cutoffAt",
    excludes: "close opportunityがcompleteでないcycle",
    incomplete: "showAsUnavailable",
  },
  cumulativeDeadlineSubmissionRate: {
    key: "cumulativeDeadlineSubmissionRate",
    granularity: ["shop"],
    numerator: "snapshot日時点までの非削除complete cycleのsubmittedAtDeadline合計",
    denominator: "snapshot日時点までの非削除complete cycleのtargetAtDeadline合計",
    timeBasis: "snapshotDate",
    excludes: "partialまたはunavailable cycle、snapshot日時点で削除済みのcycle",
    incomplete: "excludeFromRate",
  },
  cumulativeFinalSubmissionRate: {
    key: "cumulativeFinalSubmissionRate",
    granularity: ["shop"],
    numerator: "snapshot日時点までの非削除complete cycleのsubmittedAtClose合計",
    denominator: "snapshot日時点までの非削除complete cycleのtargetAtClose合計",
    timeBasis: "snapshotDate",
    excludes: "partialまたはunavailable cycle、snapshot日時点で削除済みのcycle",
    incomplete: "excludeFromRate",
  },
  confirmationLeadTimeMedianMs: {
    key: "confirmationLeadTimeMedianMs",
    granularity: ["shop"],
    numerator: "eligible cycleをconfirmationLeadTimeMs昇順に並べた中央rank。偶数件は中央2値の平均",
    denominator: "snapshot日時点の非削除confirmed complete cycle数",
    timeBasis: "snapshotDate",
    excludes: "未確定、partial、unavailable、削除cycle、負のlead time",
    incomplete: "showAsUnavailable",
  },
  confirmationLeadTimeP90Ms: {
    key: "confirmationLeadTimeP90Ms",
    granularity: ["shop"],
    numerator: "eligible cycleをconfirmationLeadTimeMs昇順に並べたnearest-rank ceil(0.9*n)の値",
    denominator: "snapshot日時点の非削除confirmed complete cycle数",
    timeBasis: "snapshotDate",
    excludes: "未確定、partial、unavailable、削除cycle、負のlead time",
    incomplete: "showAsUnavailable",
  },
  kpiEligibleShopCount: {
    key: "kpiEligibleShopCount",
    granularity: ["service", "organization"],
    numerator: "dataStartAt以降に登録され、切替後milestoneを完全観測できる非削除shop数",
    denominator: "なし",
    timeBasis: "occurredAt",
    excludes: "snapshot日時点で未登録または削除済みのshop",
    incomplete: "showAsUnavailable",
  },
  milestoneReachedRate: {
    key: "milestoneReachedRate",
    granularity: ["service", "organization", "segment"],
    numerator: "対象milestoneの初回到達日時を持つ非削除shop数",
    denominator: "登録済み非削除shop数",
    timeBasis: "occurredAt",
    excludes: "dataStartDateより前の復元不能な状態snapshot",
    incomplete: "showAsUnavailable",
  },
} as const satisfies Record<string, AnalyticsKpiDefinition>;
