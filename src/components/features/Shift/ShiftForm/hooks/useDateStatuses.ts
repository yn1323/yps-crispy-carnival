import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { shiftConfigAtom, shiftsAtom } from "../stores";
import type { DayStatus } from "../types";
import { calculateDayStaffingStatus, getDayStatus } from "../utils/staffingAlerts";

export const useDateStatuses = (): Map<string, DayStatus> | undefined => {
  const { dates, requiredStaffing } = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);

  return useMemo(() => {
    if (!requiredStaffing || requiredStaffing.length === 0) return undefined;
    const map = new Map<string, DayStatus>();
    for (const date of dates) {
      const dayOfWeek = new Date(date).getDay();
      const dayStaffing = requiredStaffing.find((rs) => rs.dayOfWeek === dayOfWeek);
      const status = calculateDayStaffingStatus({
        shifts,
        date,
        peakBands: dayStaffing?.peakBands,
        minimumStaff: dayStaffing?.minimumStaff,
      });
      map.set(date, getDayStatus(status));
    }
    return map;
  }, [dates, shifts, requiredStaffing]);
};
