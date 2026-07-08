import type { ShopStageKey, ShopStageRowDto, ShopStagesResponse } from "@/api/analyticsTypes";

export type ShopListStageFilter = "beforeStart" | "activeTrial" | "retained" | "dormant";

export type ShopListSortKey =
  | "registeredAt"
  | "shopName"
  | "staffCount"
  | "lineLinkedRate"
  | "stage"
  | "recruitmentCount";

export type ShopListSort = {
  key: ShopListSortKey;
  direction: "asc" | "desc";
};

export const SHOP_LIST_STAGE_FILTERS: { value: ShopListStageFilter; label: string; colorPalette: string }[] = [
  { value: "beforeStart", label: "開始前", colorPalette: "blue" },
  { value: "activeTrial", label: "立ち上げ", colorPalette: "orange" },
  { value: "retained", label: "継続", colorPalette: "green" },
  { value: "dormant", label: "休眠", colorPalette: "purple" },
];

const STAGE_ORDER: Record<ShopListStageFilter | "unclassified", number> = {
  beforeStart: 1,
  activeTrial: 2,
  retained: 3,
  dormant: 4,
  unclassified: 5,
};

export function getShopStageFilter(row: ShopStageRowDto): ShopListStageFilter | "unclassified" {
  if (row.stage === "activeTrialDormant" || row.stage === "retainedDormant") return "dormant";
  if (row.stage === null) return "unclassified";
  return row.stage;
}

export function getShopStageLabel(stage: ShopStageKey | null) {
  if (stage === "beforeStart") return "開始前";
  if (stage === "activeTrial") return "立ち上げ";
  if (stage === "retained") return "継続";
  if (stage === "activeTrialDormant" || stage === "retainedDormant") return "休眠";
  return "未分類";
}

export function getShopStageColorPalette(stage: ShopStageKey | null) {
  if (stage === "beforeStart") return "blue";
  if (stage === "activeTrial") return "orange";
  if (stage === "retained") return "green";
  if (stage === "activeTrialDormant" || stage === "retainedDormant") return "purple";
  return "gray";
}

export function getShopLineLinkedRate(row: ShopStageRowDto) {
  if (row.shiftTargetStaffCount <= 0) return null;
  return row.lineLinkedStaffCount / row.shiftTargetStaffCount;
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compareNullableNumber(a: number | null, b: number | null, direction: ShopListSort["direction"]) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const diff = a - b;
  return direction === "asc" ? diff : -diff;
}

function sortValue(row: ShopStageRowDto, key: ShopListSortKey) {
  switch (key) {
    case "registeredAt":
      return finiteNumber(row.shopCreatedAt);
    case "staffCount":
      return finiteNumber(row.staffCount);
    case "lineLinkedRate":
      return getShopLineLinkedRate(row);
    case "recruitmentCount":
      return finiteNumber(row.recruitmentCount);
    case "stage":
      return STAGE_ORDER[getShopStageFilter(row)];
    case "shopName":
      return row.shopName;
  }
}

export function filterShopRows(rows: ShopStageRowDto[], filters: ShopListStageFilter[]) {
  if (filters.length === 0) return [];
  const selectedFilters = new Set(filters);
  return rows.filter((row) => {
    const filter = getShopStageFilter(row);
    return filter !== "unclassified" && selectedFilters.has(filter);
  });
}

export function sortShopRows(rows: ShopStageRowDto[], sort: ShopListSort) {
  return [...rows].sort((a, b) => {
    const aValue = sortValue(a, sort.key);
    const bValue = sortValue(b, sort.key);
    const result =
      typeof aValue === "string" && typeof bValue === "string"
        ? sort.direction === "asc"
          ? aValue.localeCompare(bValue, "ja-JP")
          : bValue.localeCompare(aValue, "ja-JP")
        : compareNullableNumber(aValue as number | null, bValue as number | null, sort.direction);
    return result || compareNullableNumber(finiteNumber(a.shopCreatedAt), finiteNumber(b.shopCreatedAt), "desc");
  });
}

export function getShopListRows(stages: ShopStagesResponse | null, filters: ShopListStageFilter[], sort: ShopListSort) {
  return sortShopRows(filterShopRows([...(stages?.rows ?? [])], filters), sort);
}
