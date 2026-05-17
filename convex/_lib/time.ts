export const MAX_SHIFT_TIME_MINUTES = 29 * 60;

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
