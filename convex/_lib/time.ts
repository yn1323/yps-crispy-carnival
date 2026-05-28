export const MAX_SHIFT_TIME_MINUTES = 36 * 60;

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

export function isSupportedShiftTime(time: string): boolean {
  if (!TIME_PATTERN.test(time)) return false;
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = hour * 60 + minute;
  return (
    Number.isFinite(hour) &&
    Number.isFinite(minute) &&
    hour >= 0 &&
    minute >= 0 &&
    minute < 60 &&
    totalMinutes <= MAX_SHIFT_TIME_MINUTES
  );
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function formatShiftClockTime(time: string): string {
  const [hourText, minuteText = "00"] = time.split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return time;

  const minute = minuteText.padStart(2, "0");
  if (hour >= 24) return `翌${hour - 24}:${minute}`;
  return `${hourText.padStart(2, "0")}:${minute}`;
}

export function formatShiftClockTimeRange(startTime: string, endTime: string, separator = "〜"): string {
  return `${formatShiftClockTime(startTime)}${separator}${formatShiftClockTime(endTime)}`;
}

type ShiftTimeAssignment = {
  startTime: string;
  endTime: string;
  optionId?: string;
};

type ShiftTimeLabelPattern =
  | { kind: "dateOnly" }
  | { kind: "time" }
  | {
      kind: "shiftType";
      options: Array<{ id: string; name: string; startTime: string; endTime: string }>;
    };

export function buildShiftTimeLabel(assignments: ShiftTimeAssignment[], pattern: ShiftTimeLabelPattern): string | null {
  if (assignments.length === 0) return null;
  const sortedAssignments = assignments.slice().sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  if (pattern.kind === "dateOnly") {
    return "出勤";
  }

  if (pattern.kind === "shiftType") {
    const optionById = new Map(pattern.options.map((option) => [option.id, option]));
    return sortedAssignments
      .map((assignment) => {
        const option = assignment.optionId
          ? optionById.get(assignment.optionId)
          : pattern.options.find(
              (item) => item.startTime === assignment.startTime && item.endTime === assignment.endTime,
            );
        return option
          ? `${option.name}（${formatShiftClockTimeRange(option.startTime, option.endTime, "-")}）`
          : formatShiftClockTimeRange(assignment.startTime, assignment.endTime, "-");
      })
      .join(" / ");
  }

  return sortedAssignments
    .map((assignment) => formatShiftClockTimeRange(assignment.startTime, assignment.endTime, "-"))
    .join(" / ");
}
