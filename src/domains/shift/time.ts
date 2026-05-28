export const MAX_SHIFT_TIME_MINUTES = 36 * 60;

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

// 時刻文字列 → 分（"10:30" → 630）
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// 分 → 時刻文字列（630 → "10:30"）
export const minutesToTime = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

// 分を時間表示に変換（480 → "8h"）
export const minutesToHoursLabel = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h`;
};

export const isSupportedShiftTime = (time: string): boolean => {
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
};

export const formatShiftClockTime = (time: string): string => {
  const [hourText, minuteText = "00"] = time.split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return time;

  const minute = minuteText.padStart(2, "0");
  if (hour >= 24) return `翌${hour - 24}:${minute}`;
  return `${hourText.padStart(2, "0")}:${minute}`;
};

export const formatShiftClockTimeRange = (startTime: string, endTime: string): string =>
  `${formatShiftClockTime(startTime)}〜${formatShiftClockTime(endTime)}`;

export const formatShiftTimeSelectLabel = (time: string): string => {
  const minutes = timeToMinutes(time);
  if (!Number.isFinite(minutes)) return time;
  if (minutes >= 24 * 60) {
    const displayMinutes = minutes - 24 * 60;
    return `翌 ${minutesToTime(displayMinutes)}`;
  }
  return minutesToTime(minutes);
};

export type ShiftTimeOption = { value: string; label: string };

export type GenerateShiftTimeOptionsParams = {
  startMinutes?: number;
  endMinutes: number;
  stepMinutes?: number;
  labelFormatter?: (time: string) => string;
};

export const generateShiftTimeOptions = ({
  startMinutes = 0,
  endMinutes,
  stepMinutes = 30,
  labelFormatter = formatShiftTimeSelectLabel,
}: GenerateShiftTimeOptionsParams): ShiftTimeOption[] => {
  if (stepMinutes <= 0 || endMinutes < startMinutes) return [];
  const options: ShiftTimeOption[] = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += stepMinutes) {
    const value = minutesToTime(minutes);
    options.push({ value, label: labelFormatter(value) });
  }
  return options;
};
