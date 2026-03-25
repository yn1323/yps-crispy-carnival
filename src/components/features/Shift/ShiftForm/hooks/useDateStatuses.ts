import type { DayStatus } from "../types";

// v3: requiredStaffingが削除されたため、常にundefinedを返す
export const useDateStatuses = (): Map<string, DayStatus> | undefined => {
  return undefined;
};
