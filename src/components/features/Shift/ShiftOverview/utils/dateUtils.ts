import dayjs from "dayjs";

/**
 * 開始日から終了日までの日付配列を取得
 * @param startDate "2026-01-27"
 * @param endDate "2026-02-09"
 * @returns ["2026-01-27", "2026-01-28", ...]
 */
export const getDateRange = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);

  while (current.isBefore(end) || current.isSame(end, "day")) {
    dates.push(current.format("YYYY-MM-DD"));
    current = current.add(1, "day");
  }

  return dates;
};

/**
 * 期間に含まれる月を取得
 * @param startDate "2026-01-27"
 * @param endDate "2026-02-09"
 * @returns ["2026-01", "2026-02"]
 */
export const getMonthsInRange = (startDate: string, endDate: string): string[] => {
  const months: string[] = [];
  let current = dayjs(startDate).startOf("month");
  const end = dayjs(endDate);

  while (current.isBefore(end) || current.isSame(end, "month")) {
    months.push(current.format("YYYY-MM"));
    current = current.add(1, "month");
  }

  return months;
};

/**
 * 祝日判定
 */
export const isHoliday = (date: string, holidays: string[]): boolean => {
  return holidays.includes(date);
};

/**
 * 曜日取得（0=日曜, 1=月曜, ..., 6=土曜）
 */
export const getDayOfWeek = (date: string): number => {
  return dayjs(date).day();
};

/**
 * 土曜日判定
 */
export const isSaturday = (date: string): boolean => {
  return getDayOfWeek(date) === 6;
};

/**
 * 日曜日判定
 */
export const isSunday = (date: string): boolean => {
  return getDayOfWeek(date) === 0;
};

/**
 * 日付を表示用にフォーマット
 * @param date "2026-01-27"
 * @returns "1/27"
 */
export const formatDateShort = (date: string): string => {
  return dayjs(date).format("M/D");
};

/**
 * 曜日を表示用に取得
 * @param date "2026-01-27"
 * @returns "月"
 */
export const getWeekdayLabel = (date: string): string => {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return weekdays[getDayOfWeek(date)];
};

/**
 * 月を表示用にフォーマット
 * @param month "2026-01"
 * @returns "1月計"
 */
export const formatMonthLabel = (month: string): string => {
  return `${dayjs(month).format("M")}月計`;
};

/**
 * 日付から月キーを取得
 * @param date "2026-01-27"
 * @returns "2026-01"
 */
export const getMonthKey = (date: string): string => {
  return dayjs(date).format("YYYY-MM");
};
