import type { ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";

export const formatShiftTypeTimeRange = (option: ShiftTypeOptionLike): string =>
  formatShiftClockTimeRange(option.startTime, option.endTime);
