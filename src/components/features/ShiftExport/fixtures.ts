import type { ShiftExportData } from "./types";

export function createExportFixture(overrides: Partial<ShiftExportData> = {}): ShiftExportData {
  return {
    shopName: "シフトリ駅前店",
    recruitment: {
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      shopClosedDates: ["2026-08-02"],
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "26:00" },
    },
    staffs: [
      { id: "staff-2", name: "田中 花子", isRemoved: false },
      { id: "staff-1", name: "鈴木 太郎", isRemoved: false },
    ],
    assignments: [{ staffId: "staff-2", date: "2026-08-01", startTime: "09:00", endTime: "17:00", optionId: null }],
    ...overrides,
    dateNotes: overrides.dateNotes ?? [],
  };
}

/** 日別のバーの代表例。ポジションの切り替え、休憩、勤務のない人、定休日を含む。 */
export function createDailyExportFixture(overrides: Partial<ShiftExportData> = {}): ShiftExportData {
  const work = (
    staffId: string,
    startTime: string,
    endTime: string,
    positionId: string,
    breaks: { startTime: string; endTime: string }[] = [],
  ) => ({ staffId, date: "2026-08-01", startTime, endTime, optionId: null, positionId, breaks });
  return {
    shopName: "シフトリ駅前店",
    recruitment: {
      periodStart: "2026-08-01",
      periodEnd: "2026-08-03",
      shopClosedDates: ["2026-08-02"],
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    },
    staffs: [
      { id: "staff-1", name: "田中 花子", isRemoved: false },
      { id: "staff-2", name: "伊藤 健", isRemoved: false },
      { id: "staff-3", name: "高橋 美咲", isRemoved: false },
      { id: "staff-4", name: "鈴木 太郎", isRemoved: false },
      { id: "staff-5", name: "佐藤 一郎", isRemoved: false },
      { id: "staff-6", name: "山本 さくら", isRemoved: false },
    ],
    positions: [
      { id: "hall", name: "ホール", color: "#60a5fa" },
      { id: "kitchen", name: "キッチン", color: "#fb923c" },
    ],
    assignments: [
      work("staff-1", "17:00", "22:00", "hall"),
      work("staff-2", "17:00", "22:00", "kitchen"),
      work("staff-3", "11:00", "14:00", "hall"),
      work("staff-3", "14:00", "20:00", "kitchen", [{ startTime: "16:00", endTime: "16:30" }]),
      work("staff-4", "10:00", "15:00", "hall"),
      work("staff-5", "09:00", "17:00", "kitchen", [{ startTime: "12:00", endTime: "13:00" }]),
      { ...work("staff-6", "10:00", "18:00", "hall"), date: "2026-08-03" },
    ],
    ...overrides,
    dateNotes: overrides.dateNotes ?? [],
  };
}
