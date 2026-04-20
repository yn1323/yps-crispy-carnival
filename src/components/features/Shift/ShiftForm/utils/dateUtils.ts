import dayjs from "dayjs";

// 開始日から終了日までの日付配列を取得
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

// 期間に含まれる月を取得
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

// 祝日判定
export const isHoliday = (date: string, holidays: string[]): boolean => {
  return holidays.includes(date);
};

// 曜日取得（0=日曜, 1=月曜, ..., 6=土曜）
export const getDayOfWeek = (date: string): number => {
  return dayjs(date).day();
};

// 土曜日判定
export const isSaturday = (date: string): boolean => {
  return getDayOfWeek(date) === 6;
};

// 日曜日判定
export const isSunday = (date: string): boolean => {
  return getDayOfWeek(date) === 0;
};

// 日付を表示用にフォーマット（"2026-01-27" → "1/27"）
export const formatDateShort = (date: string): string => {
  return dayjs(date).format("M/D");
};

// 日付を曜日付きで表示用にフォーマット（"2026-01-27" → "1/27(月)"）
export const formatDateWithWeekday = (date: string): string => {
  return `${formatDateShort(date)}(${getWeekdayLabel(date)})`;
};

// 曜日を表示用に取得（"2026-01-27" → "月"）
export const getWeekdayLabel = (date: string): string => {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return weekdays[getDayOfWeek(date)];
};

// 月を表示用にフォーマット（"2026-01" → "1月計"）
export const formatMonthLabel = (month: string): string => {
  return `${dayjs(month).format("M")}月計`;
};

// 日付から月キーを取得（"2026-01-27" → "2026-01"）
export const getMonthKey = (date: string): string => {
  return dayjs(date).format("YYYY-MM");
};

// 日時を表示用にフォーマット（Date → "2026/3/28 23:15"）
export const formatDateTime = (date: Date): string => {
  return dayjs(date).format("YYYY/M/D HH:mm");
};

// 週開始曜日
export type WeekStart = "mon" | "sun";

// 週開始曜日から見たオフセット（0=週頭）を返す
const weekdayOffset = (date: string, weekStart: WeekStart): number => {
  const day = dayjs(date).day(); // 0=日, 1=月, ..., 6=土
  return weekStart === "mon" ? (day + 6) % 7 : day;
};

// 指定日を含む週の「週開始日」ISO を返す
export const getWeekStartDate = (date: string, weekStart: WeekStart = "mon"): string => {
  return dayjs(date).subtract(weekdayOffset(date, weekStart), "day").format("YYYY-MM-DD");
};

// 期間 dates を 7 × N の週グリッドに変換
// 返値: 各要素は { iso: "YYYY-MM-DD", inRange: boolean }。期間外セルも日付を持つ
export const buildWeeklyGrid = (
  dates: string[],
  weekStart: WeekStart = "mon",
): Array<Array<{ iso: string; inRange: boolean }>> => {
  if (dates.length === 0) return [];
  const inRangeSet = new Set(dates);
  const gridStart = dayjs(getWeekStartDate(dates[0], weekStart));
  const lastDate = dates[dates.length - 1];
  const gridEnd = dayjs(getWeekStartDate(lastDate, weekStart)).add(6, "day");
  const totalDays = gridEnd.diff(gridStart, "day") + 1;
  const weeks: Array<Array<{ iso: string; inRange: boolean }>> = [];
  for (let i = 0; i < totalDays; i += 7) {
    const week = Array.from({ length: 7 }, (_, j) => {
      const iso = gridStart.add(i + j, "day").format("YYYY-MM-DD");
      return { iso, inRange: inRangeSet.has(iso) };
    });
    weeks.push(week);
  }
  return weeks;
};
