import type { ServiceSnapshotDto, ShopStageKey, ShopStageRowDto } from "@/api/analyticsTypes";

export const STAGE_LABELS: Record<ShopStageKey, string> = {
  beforeStart: "開始前",
  activeTrial: "立ち上がり中",
  activeTrialDormant: "休眠",
  retained: "継続",
  retainedDormant: "休眠",
};

export const STAGE_COLORS: Record<ShopStageKey, string> = {
  beforeStart: "gray",
  activeTrial: "blue",
  activeTrialDormant: "orange",
  retained: "green",
  retainedDormant: "red",
};

export type StageFilter = "attention" | "all" | "beforeStart" | "activeTrial" | "retained" | "dormant";

export const STAGE_FILTERS: { value: StageFilter; label: string }[] = [
  { value: "attention", label: "要確認" },
  { value: "beforeStart", label: "開始前" },
  { value: "activeTrial", label: "立ち上がり中" },
  { value: "retained", label: "継続" },
  { value: "dormant", label: "休眠" },
  { value: "all", label: "すべて" },
];

export function filterStageRows(rows: ShopStageRowDto[], filter: StageFilter): ShopStageRowDto[] {
  switch (filter) {
    case "all":
      return rows;
    case "attention":
      return rows.filter((row) => row.alerts.length > 0);
    case "dormant":
      return rows.filter((row) => row.stage === "activeTrialDormant" || row.stage === "retainedDormant");
    default:
      return rows.filter((row) => row.stage === filter);
  }
}

export type OnboardingProgressItem = {
  label: string;
  status: "reached" | "unreached" | "unknown";
};

function hasNumberAtLeast(value: number | null | undefined, threshold: number) {
  return typeof value === "number" && value >= threshold;
}

export function onboardingProgressItems(row: ShopStageRowDto): OnboardingProgressItem[] {
  const productionRecruitmentCreated = hasNumberAtLeast(row.recruitmentCount, 2);
  return [
    { label: "店舗登録", status: "reached" },
    { label: "ガイド開始", status: "unknown" },
    { label: "テスト募集作成", status: hasNumberAtLeast(row.recruitmentCount, 1) ? "reached" : "unreached" },
    { label: "テスト申請", status: row.hasSubmission === true ? "reached" : "unreached" },
    { label: "テスト確定", status: hasNumberAtLeast(row.confirmedRecruitmentCount, 1) ? "reached" : "unreached" },
    { label: "スタッフ登録", status: row.shiftTargetStaffCount >= 1 ? "reached" : "unreached" },
    { label: "スタッフ2人登録", status: row.shiftTargetStaffCount >= 2 ? "reached" : "unreached" },
    { label: "本番シフト作成", status: productionRecruitmentCreated ? "reached" : "unreached" },
    { label: "通知送信", status: row.hasNotificationSent === true ? "reached" : "unreached" },
    { label: "実利用開始", status: row.stage !== null && row.stage !== "beforeStart" ? "reached" : "unreached" },
  ];
}

export function nextOnboardingGap(row: ShopStageRowDto): OnboardingProgressItem | null {
  return onboardingProgressItems(row).find((item) => item.status === "unreached") ?? null;
}

export type StageRowsSummary = {
  attentionCount: number;
  beforeStartTopStep: { label: string; count: number } | null;
  activeTrialAttentionCount: number;
  activeTrialOkCount: number;
  retainedAverageStaffCount: number | null;
  retainedLineLinkedRate: number | null;
  retainedAverageRecruitmentCreatedLast30Days: number | null;
  retainedSubmissionRate: number | null;
  retainedAverageFirstSubmissionLeadTimeMs: number | null;
  retainedAverageConfirmationLeadTimeMs: number | null;
  retainedNotificationLineSentRate: number | null;
  retainedAverageNotificationFailureCount: number | null;
  activeTrialDormantCount: number;
  retainedDormantCount: number;
  dormantTopStoppedStep: { label: string; count: number } | null;
};

function topEntry(counts: Map<string, number>): { label: string; count: number } | null {
  let top: { label: string; count: number } | null = null;
  for (const [label, count] of counts) {
    if (!top || count > top.count) top = { label, count };
  }
  return top;
}

export function summarizeStageRows(rows: ShopStageRowDto[]): StageRowsSummary {
  const beforeStartStepCounts = new Map<string, number>();
  const dormantStepCounts = new Map<string, number>();
  const activeTrialRows = rows.filter((row) => row.stage === "activeTrial");
  const retainedRows = rows.filter((row) => row.stage === "retained");
  let retainedStaffTotal = 0;
  let retainedLineLinkedTotal = 0;
  let retainedShiftTargetTotal = 0;
  let retainedRecruitmentCreatedLast30DaysTotal = 0;
  let retainedRecruitmentCreatedLast30DaysCount = 0;
  let retainedSubmissionRateTotal = 0;
  let retainedSubmissionRateCount = 0;
  let retainedFirstSubmissionLeadTimeTotal = 0;
  let retainedFirstSubmissionLeadTimeCount = 0;
  let retainedConfirmationLeadTimeTotal = 0;
  let retainedConfirmationLeadTimeCount = 0;
  let retainedNotificationLineSentRateTotal = 0;
  let retainedNotificationLineSentRateCount = 0;
  let retainedNotificationFailureTotal = 0;
  let retainedNotificationFailureCount = 0;

  for (const row of rows) {
    if (row.stage === "beforeStart" && row.onboardingStepLabel) {
      beforeStartStepCounts.set(row.onboardingStepLabel, (beforeStartStepCounts.get(row.onboardingStepLabel) ?? 0) + 1);
    }
    if ((row.stage === "activeTrialDormant" || row.stage === "retainedDormant") && row.onboardingStepLabel) {
      dormantStepCounts.set(row.onboardingStepLabel, (dormantStepCounts.get(row.onboardingStepLabel) ?? 0) + 1);
    }
    if (row.stage === "retained") {
      retainedStaffTotal += row.shiftTargetStaffCount;
      retainedLineLinkedTotal += row.lineLinkedStaffCount;
      retainedShiftTargetTotal += row.shiftTargetStaffCount;
      if (typeof row.recruitmentCreatedLast30Days === "number") {
        retainedRecruitmentCreatedLast30DaysTotal += row.recruitmentCreatedLast30Days;
        retainedRecruitmentCreatedLast30DaysCount += 1;
      }
      if (typeof row.submissionRate === "number") {
        retainedSubmissionRateTotal += row.submissionRate;
        retainedSubmissionRateCount += 1;
      }
      if (typeof row.averageFirstSubmissionLeadTimeMs === "number") {
        retainedFirstSubmissionLeadTimeTotal += row.averageFirstSubmissionLeadTimeMs;
        retainedFirstSubmissionLeadTimeCount += 1;
      }
      if (typeof row.averageConfirmationLeadTimeMs === "number") {
        retainedConfirmationLeadTimeTotal += row.averageConfirmationLeadTimeMs;
        retainedConfirmationLeadTimeCount += 1;
      }
      if (typeof row.notificationLineSentRate === "number") {
        retainedNotificationLineSentRateTotal += row.notificationLineSentRate;
        retainedNotificationLineSentRateCount += 1;
      }
      if (typeof row.openNotificationFailureCount === "number") {
        retainedNotificationFailureTotal += row.openNotificationFailureCount;
        retainedNotificationFailureCount += 1;
      }
    }
  }

  const activeTrialAttentionCount = activeTrialRows.filter((row) => row.alerts.length > 0).length;
  return {
    attentionCount: rows.filter((row) => row.alerts.length > 0).length,
    beforeStartTopStep: topEntry(beforeStartStepCounts),
    activeTrialAttentionCount,
    activeTrialOkCount: activeTrialRows.length - activeTrialAttentionCount,
    retainedAverageStaffCount: retainedRows.length === 0 ? null : retainedStaffTotal / retainedRows.length,
    retainedLineLinkedRate: retainedShiftTargetTotal === 0 ? null : retainedLineLinkedTotal / retainedShiftTargetTotal,
    retainedAverageRecruitmentCreatedLast30Days:
      retainedRecruitmentCreatedLast30DaysCount === 0
        ? null
        : retainedRecruitmentCreatedLast30DaysTotal / retainedRecruitmentCreatedLast30DaysCount,
    retainedSubmissionRate:
      retainedSubmissionRateCount === 0 ? null : retainedSubmissionRateTotal / retainedSubmissionRateCount,
    retainedAverageFirstSubmissionLeadTimeMs:
      retainedFirstSubmissionLeadTimeCount === 0
        ? null
        : retainedFirstSubmissionLeadTimeTotal / retainedFirstSubmissionLeadTimeCount,
    retainedAverageConfirmationLeadTimeMs:
      retainedConfirmationLeadTimeCount === 0
        ? null
        : retainedConfirmationLeadTimeTotal / retainedConfirmationLeadTimeCount,
    retainedNotificationLineSentRate:
      retainedNotificationLineSentRateCount === 0
        ? null
        : retainedNotificationLineSentRateTotal / retainedNotificationLineSentRateCount,
    retainedAverageNotificationFailureCount:
      retainedNotificationFailureCount === 0
        ? null
        : retainedNotificationFailureTotal / retainedNotificationFailureCount,
    activeTrialDormantCount: rows.filter((row) => row.stage === "activeTrialDormant").length,
    retainedDormantCount: rows.filter((row) => row.stage === "retainedDormant").length,
    dormantTopStoppedStep: topEntry(dormantStepCounts),
  };
}

/** ステージ別店舗数の日次推移（集計導入前のスナップショットは除外） */
export function stageCountsLineSeries(snapshots: ServiceSnapshotDto[]) {
  return snapshots.flatMap((snapshot) => {
    const counts = snapshot.shopStageCounts;
    if (!counts) return [];
    return [
      {
        date: snapshot.date,
        開始前: counts.beforeStart,
        立ち上がり中: counts.activeTrial,
        継続: counts.retained,
        休眠: counts.activeTrialDormant + counts.retainedDormant,
      },
    ];
  });
}
