import dayjs from "dayjs";

export type StaffStatus = "submitted" | "no_request" | "not_submitted";

export type MockStaff = {
  id: string;
  name: string;
  status: StaffStatus;
};

export type PositionSegment = {
  positionId: string;
  start: string;
  end: string;
};

export type ShiftEntry = {
  req: [string, string] | null;
  asn: [string, string] | null;
  segments?: PositionSegment[];
};

export type MockPosition = {
  id: string;
  name: string;
  color: string;
  tint: string;
};

export const POSITIONS: MockPosition[] = [
  { id: "hall", name: "ホール", color: "#14b8a6", tint: "#99f6e4" },
  { id: "kitchen", name: "キッチン", color: "#f59e0b", tint: "#fde68a" },
  { id: "register", name: "レジ", color: "#6366f1", tint: "#c7d2fe" },
];

export const TIME_RANGE = { start: 9, end: 22 };

export type DateRow = {
  iso: string;
  d: string;
  dd: number;
  w: string;
  sat?: boolean;
  sun?: boolean;
};

export const DATES: DateRow[] = [
  { iso: "2026-01-20", d: "1/20", dd: 20, w: "火" },
  { iso: "2026-01-21", d: "1/21", dd: 21, w: "水" },
  { iso: "2026-01-22", d: "1/22", dd: 22, w: "木" },
  { iso: "2026-01-23", d: "1/23", dd: 23, w: "金" },
  { iso: "2026-01-24", d: "1/24", dd: 24, w: "土", sat: true },
  { iso: "2026-01-25", d: "1/25", dd: 25, w: "日", sun: true },
  { iso: "2026-01-26", d: "1/26", dd: 26, w: "月" },
];

export const STAFFS: MockStaff[] = [
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

const s = (start: string, end: string, segments?: PositionSegment[]): ShiftEntry => ({
  req: [start, end],
  asn: [start, end],
  segments,
});
const reqOnly = (start: string, end: string): ShiftEntry => ({ req: [start, end], asn: null });
const off = (): ShiftEntry => ({ req: null, asn: null });

export const SHIFTS: Record<string, Record<string, ShiftEntry>> = {
  s1: {
    "2026-01-20": s("10:00", "18:00", [
      { positionId: "hall", start: "10:00", end: "14:00" },
      { positionId: "register", start: "14:00", end: "18:00" },
    ]),
    "2026-01-21": s("10:00", "18:00", [
      { positionId: "hall", start: "10:00", end: "13:00" },
      { positionId: "register", start: "13:00", end: "18:00" },
    ]),
    "2026-01-22": s("10:00", "18:00", [{ positionId: "hall", start: "10:00", end: "18:00" }]),
    "2026-01-23": s("10:00", "14:00", [{ positionId: "hall", start: "10:00", end: "14:00" }]),
    "2026-01-24": s("10:00", "18:00", [
      { positionId: "hall", start: "10:00", end: "14:00" },
      { positionId: "register", start: "14:00", end: "18:00" },
    ]),
    "2026-01-25": off(),
    "2026-01-26": off(),
  },
  s2: {
    "2026-01-20": off(),
    "2026-01-21": s("11:00", "19:00", [{ positionId: "kitchen", start: "11:00", end: "19:00" }]),
    "2026-01-22": s("11:00", "19:00", [{ positionId: "kitchen", start: "11:00", end: "19:00" }]),
    "2026-01-23": off(),
    "2026-01-24": s("11:00", "19:00", [{ positionId: "kitchen", start: "11:00", end: "19:00" }]),
    "2026-01-25": off(),
    "2026-01-26": s("11:00", "19:00", [{ positionId: "kitchen", start: "11:00", end: "19:00" }]),
  },
  s3: {},
  s4: {
    "2026-01-20": s("14:00", "21:00", [{ positionId: "hall", start: "14:00", end: "21:00" }]),
    "2026-01-21": off(),
    "2026-01-22": s("14:00", "21:00", [{ positionId: "hall", start: "14:00", end: "21:00" }]),
    "2026-01-23": s("14:00", "21:00", [
      { positionId: "hall", start: "14:00", end: "18:00" },
      { positionId: "register", start: "18:00", end: "21:00" },
    ]),
    "2026-01-24": s("14:00", "21:00", [{ positionId: "hall", start: "14:00", end: "21:00" }]),
    "2026-01-25": off(),
    "2026-01-26": s("14:00", "21:00", [{ positionId: "hall", start: "14:00", end: "21:00" }]),
  },
  s5: {
    "2026-01-20": s("10:00", "15:00", [{ positionId: "register", start: "10:00", end: "15:00" }]),
    "2026-01-21": s("10:00", "15:00", [{ positionId: "register", start: "10:00", end: "15:00" }]),
    "2026-01-22": off(),
    "2026-01-23": s("10:00", "15:00", [{ positionId: "register", start: "10:00", end: "15:00" }]),
    "2026-01-24": reqOnly("10:00", "15:00"),
    "2026-01-25": off(),
    "2026-01-26": off(),
  },
  s6: {
    "2026-01-20": s("09:00", "17:00", [
      { positionId: "kitchen", start: "09:00", end: "13:00" },
      { positionId: "hall", start: "13:00", end: "17:00" },
    ]),
    "2026-01-21": off(),
    "2026-01-22": s("09:00", "17:00", [{ positionId: "kitchen", start: "09:00", end: "17:00" }]),
    "2026-01-23": off(),
    "2026-01-24": s("09:00", "17:00", [{ positionId: "kitchen", start: "09:00", end: "17:00" }]),
    "2026-01-25": off(),
    "2026-01-26": off(),
  },
  s7: {},
  s8: {
    "2026-01-20": s("10:00", "16:00", [{ positionId: "hall", start: "10:00", end: "16:00" }]),
    "2026-01-21": s("10:00", "16:00", [{ positionId: "hall", start: "10:00", end: "16:00" }]),
    "2026-01-22": s("10:00", "16:00", [{ positionId: "hall", start: "10:00", end: "16:00" }]),
    "2026-01-23": s("10:00", "16:00", [{ positionId: "hall", start: "10:00", end: "16:00" }]),
    "2026-01-24": s("10:00", "16:00", [{ positionId: "hall", start: "10:00", end: "16:00" }]),
    "2026-01-25": off(),
    "2026-01-26": off(),
  },
  s9: {},
  s10: {
    "2026-01-20": s("11:00", "18:00", [{ positionId: "register", start: "11:00", end: "18:00" }]),
    "2026-01-21": off(),
    "2026-01-22": s("11:00", "18:00", [{ positionId: "register", start: "11:00", end: "18:00" }]),
    "2026-01-23": off(),
    "2026-01-24": s("11:00", "18:00", [{ positionId: "register", start: "11:00", end: "18:00" }]),
    "2026-01-25": off(),
    "2026-01-26": s("11:00", "18:00", [{ positionId: "register", start: "11:00", end: "18:00" }]),
  },
};

export const PEAK_BANDS = [
  { startHour: 12, endHour: 14, label: "ランチ", required: 4 },
  { startHour: 18, endHour: 21, label: "ディナー", required: 4 },
];

export function requiredAt(hour: number): number {
  for (const b of PEAK_BANDS) if (hour >= b.startHour && hour < b.endHour) return b.required;
  return 2;
}

export function timeToPct(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const total = TIME_RANGE.end - TIME_RANGE.start;
  return ((h + m / 60 - TIME_RANGE.start) / total) * 100;
}

export function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

export function hoursBetween(a: string, b: string): number {
  return minutesBetween(a, b) / 60;
}

export function shiftOf(staffId: string, iso: string): ShiftEntry | null {
  return SHIFTS[staffId]?.[iso] ?? null;
}

export function countWorkingAt(iso: string, hour: number): number {
  let n = 0;
  for (const sid of Object.keys(SHIFTS)) {
    const sh = SHIFTS[sid][iso];
    if (!sh?.asn) continue;
    const [s1] = sh.asn[0].split(":").map(Number);
    const [e1] = sh.asn[1].split(":").map(Number);
    if (hour >= s1 && hour < e1) n += 1;
  }
  return n;
}

export function dayIsSatisfied(iso: string): boolean {
  for (let h = TIME_RANGE.start; h < TIME_RANGE.end; h++) {
    if (countWorkingAt(iso, h) < requiredAt(h)) return false;
  }
  return true;
}

export function positionById(id: string): MockPosition {
  return POSITIONS.find((p) => p.id === id) ?? POSITIONS[0];
}

export function dowColor(date: DateRow): string {
  if (date.sat) return "#2563eb";
  if (date.sun) return "#dc2626";
  return "#3f3f46";
}

export function workingStaffFor(iso: string) {
  return STAFFS.filter((st) => SHIFTS[st.id]?.[iso]?.asn);
}

export function unsubmittedStaff() {
  return STAFFS.filter((st) => st.status === "not_submitted");
}

// ---- Month (L1b) dataset ---------------------------------------------------
// 4 weeks starting Mon 2026-01-05, derived deterministically from STAFFS.

export type MonthDate = {
  iso: string;
  d: string;
  w: string;
  dd: number;
  weekIdx: number;
  sat: boolean;
  sun: boolean;
};

const WK = ["日", "月", "火", "水", "木", "金", "土"];

export function buildMonthDates(weeks: number): MonthDate[] {
  const start = dayjs("2026-01-05");
  const out: MonthDate[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = start.add(i, "day");
    const dow = d.day();
    out.push({
      iso: d.format("YYYY-MM-DD"),
      d: `${d.month() + 1}/${d.date()}`,
      w: WK[dow],
      dd: d.date(),
      weekIdx: Math.floor(i / 7),
      sat: dow === 6,
      sun: dow === 0,
    });
  }
  return out;
}

export function monthShiftOf(staffId: string, dayIdx: number): [string, string] | null {
  const staff = STAFFS.find((st) => st.id === staffId);
  if (!staff || staff.status === "not_submitted") return null;
  const num = Number.parseInt(staffId.slice(1), 10);
  const seed = (num * 7 + dayIdx) % 11;
  if (seed < 3) return null;
  const starts: [string, string][] = [
    ["09:00", "15:00"],
    ["10:00", "18:00"],
    ["11:00", "19:00"],
    ["14:00", "21:00"],
    ["13:00", "20:00"],
  ];
  const idx = (num + dayIdx) % starts.length;
  return starts[idx];
}
