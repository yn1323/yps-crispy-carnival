import type { ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";

export const formatShiftTypeTime = (time: string): string => {
  const [hourText, minuteText = "00"] = time.split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour) || hour < 24) return time;
  return `翌${hour - 24}:${minuteText}`;
};

export const formatShiftTypeTimeRange = (option: ShiftTypeOptionLike): string =>
  `${formatShiftTypeTime(option.startTime)}〜${formatShiftTypeTime(option.endTime)}`;
