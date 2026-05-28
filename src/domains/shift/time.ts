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
