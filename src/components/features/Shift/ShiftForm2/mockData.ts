export type StaffStatus = "submitted" | "no_request" | "not_submitted";

export type Staff = {
  id: string;
  name: string;
  status: StaffStatus;
};

export type ShiftRange = [string, string];

export type DayShift = {
  req: ShiftRange | null;
  asn: ShiftRange | null;
};

export const STAFFS: Staff[] = [
  { id: "s1", name: "鈴木太郎", status: "submitted" },
  { id: "s2", name: "佐藤花子", status: "submitted" },
  { id: "s3", name: "田中次郎", status: "not_submitted" },
  { id: "s4", name: "山田美咲", status: "submitted" },
  { id: "s5", name: "高橋翔太", status: "submitted" },
  { id: "s6", name: "渡辺優子", status: "submitted" },
  { id: "s7", name: "伊藤健一", status: "no_request" },
  { id: "s8", name: "中村真理", status: "submitted" },
  { id: "s9", name: "小林大輔", status: "not_submitted" },
  { id: "s10", name: "加藤美穂", status: "submitted" },
];

export const TIME_RANGE = { start: 9, end: 22 };

export const START_DATE = new Date(2026, 0, 5);
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export type DateInfo = {
  iso: string;
  label: string;
  day: number;
  month: number;
  wk: string;
  isSat: boolean;
  isSun: boolean;
  weekIdx: number;
  dayOffset: number;
};

export const buildDates = (period: "1w" | "2w" | "1m"): DateInfo[] => {
  const n = period === "1w" ? 7 : period === "2w" ? 14 : 28;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(START_DATE);
    d.setDate(START_DATE.getDate() + i);
    const dow = d.getDay();
    return {
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      day: d.getDate(),
      month: d.getMonth() + 1,
      wk: WEEKDAYS[dow],
      isSat: dow === 6,
      isSun: dow === 0,
      weekIdx: Math.floor(i / 7),
      dayOffset: i,
    };
  });
};

const PATTERNS: ShiftRange[] = [
  ["09:00", "15:00"],
  ["10:00", "18:00"],
  ["11:00", "19:00"],
  ["14:00", "21:00"],
  ["13:00", "20:00"],
];

export const getShift = (staff: Staff, dayOffset: number): DayShift => {
  if (staff.status === "not_submitted") return { req: null, asn: null };
  const seed = (Number.parseInt(staff.id.slice(1), 10) * 7 + dayOffset) % 11;
  if (seed < 3) return { req: null, asn: null };
  const idx = (Number.parseInt(staff.id.slice(1), 10) + dayOffset) % PATTERNS.length;
  const base = PATTERNS[idx];
  const unassigned = seed === 9;
  return { req: base, asn: unassigned ? null : base };
};

export const shiftHours = (range: ShiftRange | null): number => {
  if (!range) return 0;
  return Number.parseInt(range[1], 10) - Number.parseInt(range[0], 10);
};

export const timeToPct = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  const totalMin = (TIME_RANGE.end - TIME_RANGE.start) * 60;
  return (((h - TIME_RANGE.start) * 60 + m) / totalMin) * 100;
};

const AVATAR_PALETTE = [
  { bg: "#fef3c7", fg: "#92400e" },
  { bg: "#dbeafe", fg: "#1e40af" },
  { bg: "#fce7f3", fg: "#9d174d" },
  { bg: "#d1fae5", fg: "#065f46" },
  { bg: "#ede9fe", fg: "#5b21b6" },
  { bg: "#fee2e2", fg: "#991b1b" },
  { bg: "#cffafe", fg: "#155e75" },
  { bg: "#fef9c3", fg: "#854d0e" },
  { bg: "#e0e7ff", fg: "#3730a3" },
  { bg: "#fed7aa", fg: "#9a3412" },
];

export const staffColor = (staff: Staff) =>
  AVATAR_PALETTE[(Number.parseInt(staff.id.slice(1), 10) - 1) % AVATAR_PALETTE.length];

export const dayColor = (d: DateInfo) => {
  if (d.isSat) return "#3b82f6";
  if (d.isSun) return "#ef4444";
  return "#3f3f46";
};
