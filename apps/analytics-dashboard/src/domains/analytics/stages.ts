import type { ServiceSnapshotDto, ShopStageKey, ShopStageRowDto } from "@/api/analyticsTypes";

export const STAGE_LABELS: Record<ShopStageKey, string> = {
  beforeStart: "開始前",
  activeTrial: "立ち上がり中",
  activeTrialDormant: "立ち上がり後休眠",
  retained: "継続中",
  retainedDormant: "継続後休眠",
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
  { value: "retained", label: "継続中" },
  { value: "dormant", label: "休眠中" },
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
        継続中: counts.retained,
        休眠中: counts.activeTrialDormant + counts.retainedDormant,
      },
    ];
  });
}
