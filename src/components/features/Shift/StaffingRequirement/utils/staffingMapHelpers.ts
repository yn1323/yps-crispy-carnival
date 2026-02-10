import type { StaffingEntry } from "../types";

// day-hour-position のキー生成
export const createStaffingKey = (day: number, hour: number, position: string) => `${day}-${hour}-${position}`;

// hour-position のキー生成（StaffingTable / MobileAccordionView用）
export const createHourPositionKey = (hour: number, position: string) => `${hour}-${position}`;

// StaffingEntry[] → Record<string, number>
export const createStaffingMapFromEntries = (staffing: StaffingEntry[]): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const entry of staffing) {
    map[createHourPositionKey(entry.hour, entry.position)] = entry.requiredCount;
  }
  return map;
};

// フラットレコード(DB) → Record<string, number>
export const createStaffingMapFromFlat = (
  records: { dayOfWeek: number; hour: number; position: string; requiredCount: number }[],
): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const item of records) {
    map[createStaffingKey(item.dayOfWeek, item.hour, item.position)] = item.requiredCount;
  }
  return map;
};

// 人員数を更新した新しいstaffing配列を返す（clamp: 0-10）
export const updateStaffingEntry = (
  staffing: StaffingEntry[],
  hour: number,
  position: string,
  value: number,
): StaffingEntry[] => {
  const clampedValue = Math.max(0, Math.min(10, value));
  const existingIndex = staffing.findIndex((e) => e.hour === hour && e.position === position);
  if (existingIndex >= 0) {
    return staffing.map((e, i) => (i === existingIndex ? { ...e, requiredCount: clampedValue } : e));
  }
  return [...staffing, { hour, position, requiredCount: clampedValue }];
};
