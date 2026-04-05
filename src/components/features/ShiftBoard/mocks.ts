import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/components/features/Shift/ShiftForm/types";

export const mockDates = [
  "2026-01-20",
  "2026-01-21",
  "2026-01-22",
  "2026-01-23",
  "2026-01-24",
  "2026-01-25",
  "2026-01-26",
];

export const mockTimeRange: TimeRange = { start: 9, end: 22, unit: 30 };

export const mockPositions: PositionType[] = [
  { id: "pos-1", name: "ホール", color: "#3b82f6" },
  { id: "pos-2", name: "キッチン", color: "#f59e0b" },
  { id: "pos-3", name: "レジ", color: "#10b981" },
];

export const mockStaffs: StaffType[] = [
  { id: "s1", name: "鈴木太郎", isSubmitted: true },
  { id: "s2", name: "佐藤花子", isSubmitted: true },
  { id: "s3", name: "田中次郎", isSubmitted: false },
  { id: "s4", name: "山田美咲", isSubmitted: true },
  { id: "s5", name: "高橋翔太", isSubmitted: true },
  { id: "s6", name: "渡辺優子", isSubmitted: true },
  { id: "s7", name: "伊藤健一", isSubmitted: true },
  { id: "s8", name: "中村真理", isSubmitted: true },
  { id: "s9", name: "小林大輔", isSubmitted: false },
  { id: "s10", name: "加藤美穂", isSubmitted: true },
];

const createShift = (
  staffId: string,
  staffName: string,
  date: string,
  requestedStart: string | null,
  requestedEnd: string | null,
  positions: { positionId: string; positionName: string; color: string; start: string; end: string }[],
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName,
  date,
  requestedTime: requestedStart && requestedEnd ? { start: requestedStart, end: requestedEnd } : null,
  positions: positions.map((p, i) => ({ id: `seg-${staffId}-${date}-${i}`, ...p })),
});

export const mockShifts: ShiftData[] = [
  // 鈴木太郎 - 月火水木金出勤
  createShift("s1", "鈴木太郎", "2026-01-20", "10:00", "18:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "18:00" },
  ]),
  createShift("s1", "鈴木太郎", "2026-01-21", "10:00", "18:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "18:00" },
  ]),
  createShift("s1", "鈴木太郎", "2026-01-22", "10:00", "18:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "18:00" },
  ]),
  createShift("s1", "鈴木太郎", "2026-01-23", "10:00", "14:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "14:00" },
  ]),
  createShift("s1", "鈴木太郎", "2026-01-24", "10:00", "18:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "18:00" },
  ]),

  // 佐藤花子 - 火水金日出勤
  createShift("s2", "佐藤花子", "2026-01-21", "11:00", "19:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "11:00", end: "19:00" },
  ]),
  createShift("s2", "佐藤花子", "2026-01-22", "11:00", "19:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "11:00", end: "19:00" },
  ]),
  createShift("s2", "佐藤花子", "2026-01-24", "11:00", "19:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "11:00", end: "19:00" },
  ]),
  createShift("s2", "佐藤花子", "2026-01-26", "11:00", "19:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "11:00", end: "19:00" },
  ]),

  // 山田美咲 - 月水木金日出勤（午後）
  createShift("s4", "山田美咲", "2026-01-20", "14:00", "21:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "14:00", end: "21:00" },
  ]),
  createShift("s4", "山田美咲", "2026-01-22", "14:00", "21:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "14:00", end: "21:00" },
  ]),
  createShift("s4", "山田美咲", "2026-01-23", "14:00", "21:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "14:00", end: "21:00" },
  ]),
  createShift("s4", "山田美咲", "2026-01-24", "14:00", "21:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "14:00", end: "21:00" },
  ]),
  createShift("s4", "山田美咲", "2026-01-26", "14:00", "21:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "14:00", end: "21:00" },
  ]),

  // 高橋翔太 - 月火木金出勤（午前短め）
  createShift("s5", "高橋翔太", "2026-01-20", "10:00", "15:00", [
    { positionId: "pos-3", positionName: "レジ", color: "#10b981", start: "10:00", end: "15:00" },
  ]),
  createShift("s5", "高橋翔太", "2026-01-21", "10:00", "15:00", [
    { positionId: "pos-3", positionName: "レジ", color: "#10b981", start: "10:00", end: "15:00" },
  ]),
  createShift("s5", "高橋翔太", "2026-01-23", "10:00", "15:00", [
    { positionId: "pos-3", positionName: "レジ", color: "#10b981", start: "10:00", end: "15:00" },
  ]),
  createShift("s5", "高橋翔太", "2026-01-24", "10:00", "15:00", [
    { positionId: "pos-3", positionName: "レジ", color: "#10b981", start: "10:00", end: "15:00" },
  ]),

  // 渡辺優子 - 月水金出勤
  createShift("s6", "渡辺優子", "2026-01-20", "09:00", "17:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "09:00", end: "17:00" },
  ]),
  createShift("s6", "渡辺優子", "2026-01-22", "09:00", "17:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "09:00", end: "17:00" },
  ]),
  createShift("s6", "渡辺優子", "2026-01-24", "09:00", "17:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "09:00", end: "17:00" },
  ]),

  // 伊藤健一 - 火木土出勤
  createShift("s7", "伊藤健一", "2026-01-21", "12:00", "20:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "12:00", end: "20:00" },
  ]),
  createShift("s7", "伊藤健一", "2026-01-23", "12:00", "20:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "12:00", end: "20:00" },
  ]),
  createShift("s7", "伊藤健一", "2026-01-25", "12:00", "20:00", [
    { positionId: "pos-1", positionName: "ホール", color: "#3b82f6", start: "12:00", end: "20:00" },
  ]),

  // 中村真理 - 月火水木金出勤
  createShift("s8", "中村真理", "2026-01-20", "10:00", "16:00", [
    { positionId: "pos-3", positionName: "レジ", color: "#10b981", start: "10:00", end: "16:00" },
  ]),
  createShift("s8", "中村真理", "2026-01-21", "10:00", "16:00", [
    { positionId: "pos-3", positionName: "レジ", color: "#10b981", start: "10:00", end: "16:00" },
  ]),
  createShift("s8", "中村真理", "2026-01-22", "10:00", "16:00", [
    { positionId: "pos-3", positionName: "レジ", color: "#10b981", start: "10:00", end: "16:00" },
  ]),
  createShift("s8", "中村真理", "2026-01-23", "10:00", "16:00", [
    { positionId: "pos-3", positionName: "レジ", color: "#10b981", start: "10:00", end: "16:00" },
  ]),
  createShift("s8", "中村真理", "2026-01-24", "10:00", "16:00", [
    { positionId: "pos-3", positionName: "レジ", color: "#10b981", start: "10:00", end: "16:00" },
  ]),

  // 加藤美穂 - 月水金日出勤
  createShift("s10", "加藤美穂", "2026-01-20", "11:00", "18:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "11:00", end: "18:00" },
  ]),
  createShift("s10", "加藤美穂", "2026-01-22", "11:00", "18:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "11:00", end: "18:00" },
  ]),
  createShift("s10", "加藤美穂", "2026-01-24", "11:00", "18:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "11:00", end: "18:00" },
  ]),
  createShift("s10", "加藤美穂", "2026-01-26", "11:00", "18:00", [
    { positionId: "pos-2", positionName: "キッチン", color: "#f59e0b", start: "11:00", end: "18:00" },
  ]),
];

export const mockPeriodLabel = "1/20(月)〜1/26(日) のシフト";
