import type { OverviewSortMode, StaffRowData } from "../types";

/**
 * スタッフ行データをソート
 */
export const sortStaffsForOverview = (staffs: StaffRowData[], sortMode: OverviewSortMode): StaffRowData[] => {
  if (sortMode === "default") {
    return staffs;
  }

  return [...staffs].sort((a, b) => {
    switch (sortMode) {
      case "name":
        // 日本語名前順
        return a.staffName.localeCompare(b.staffName, "ja");

      case "totalHours":
        // 勤務時間降順
        return b.totalMinutes - a.totalMinutes;

      default:
        return 0;
    }
  });
};
