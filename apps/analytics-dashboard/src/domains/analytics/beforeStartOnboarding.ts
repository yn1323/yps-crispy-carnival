import type { ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";

const DAY_MS = 24 * 60 * 60 * 1000;

export type BeforeStartTutorialStep = {
  index: number;
  label: string;
  shortLabel: string;
  isReached: (row: ShopStageRowDto) => boolean;
};

export const BEFORE_START_TUTORIAL_STEPS: BeforeStartTutorialStep[] = [
  {
    index: 1,
    label: "店舗登録",
    shortLabel: "店舗登録",
    isReached: () => true,
  },
  {
    index: 2,
    label: "テスト用シフト作成",
    shortLabel: "シフト作成",
    isReached: (row) => (row.recruitmentCount ?? 0) >= 1,
  },
  {
    index: 3,
    label: "自分でシフト申請",
    shortLabel: "シフト申請",
    isReached: (row) => row.hasSubmission === true,
  },
  {
    index: 4,
    label: "テストシフト確定",
    shortLabel: "シフト確定",
    isReached: (row) => (row.confirmedRecruitmentCount ?? 0) >= 1,
  },
  {
    index: 5,
    label: "スタッフ追加",
    shortLabel: "スタッフ追加",
    isReached: (row) => row.shiftTargetStaffCount >= 2,
  },
];

export const BEFORE_START_DROPOFF_STEPS = [...BEFORE_START_TUTORIAL_STEPS];

export type BeforeStartDropoffStepCount = BeforeStartTutorialStep & {
  count: number;
  displayIndex: number;
  percentage: number;
};

export function getShopCreatedAt(row: ShopStageRowDto) {
  return typeof row.shopCreatedAt === "number" && Number.isFinite(row.shopCreatedAt) ? row.shopCreatedAt : null;
}

export function getBeforeStartRows(stages: ShopStagesResponse | null) {
  return [...(stages?.rows ?? [])]
    .filter((row) => row.stage === "beforeStart")
    .sort((a, b) => (getShopCreatedAt(b) ?? 0) - (getShopCreatedAt(a) ?? 0));
}

export function resolveBeforeStartTutorialStep(row: ShopStageRowDto) {
  let reached = BEFORE_START_TUTORIAL_STEPS[0];
  for (const step of BEFORE_START_TUTORIAL_STEPS) {
    if (!step.isReached(row)) break;
    reached = step;
  }
  return reached;
}

export function getBeforeStartDropoffStepCounts(rows: ShopStageRowDto[]): BeforeStartDropoffStepCount[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const step = resolveBeforeStartTutorialStep(row);
    counts.set(step.index, (counts.get(step.index) ?? 0) + 1);
  }
  return BEFORE_START_DROPOFF_STEPS.map((step, index) => {
    const count = counts.get(step.index) ?? 0;
    return {
      ...step,
      count,
      displayIndex: index + 1,
      percentage: rows.length === 0 ? 0 : count / rows.length,
    };
  });
}

export function getBeforeStartElapsedDays(row: ShopStageRowDto) {
  const shopCreatedAt = getShopCreatedAt(row);
  if (shopCreatedAt === null) return null;
  const to = row.stageReferenceAt ?? row.computedAt;
  return Math.max(0, Math.floor((to - shopCreatedAt) / DAY_MS));
}

export function getBeforeStartAverageElapsedDays(rows: ShopStageRowDto[]) {
  const elapsedDays = rows.flatMap((row) => {
    const value = getBeforeStartElapsedDays(row);
    return value === null ? [] : [value];
  });
  if (elapsedDays.length === 0) return null;
  return elapsedDays.reduce((sum, value) => sum + value, 0) / elapsedDays.length;
}
