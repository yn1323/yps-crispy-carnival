import type { ShiftExportData } from "./types";

export function createExportFixture(overrides: Partial<ShiftExportData> = {}): ShiftExportData {
  return {
    shopName: "シフトリ駅前店",
    recruitment: {
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      shopClosedDates: ["2026-08-02"],
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "26:00" },
      draftSavedAt: 1,
      confirmedAt: null,
      isConfirmed: false,
    },
    staffs: [
      { id: "staff-2", name: "田中 花子", isRemoved: false },
      { id: "staff-1", name: "鈴木 太郎", isRemoved: false },
    ],
    assignments: [{ staffId: "staff-2", date: "2026-08-01", startTime: "09:00", endTime: "17:00", optionId: null }],
    confirmationState: "unconfirmed",
    contentComparison: "notApplicable",
    notificationState: "notApplicable",
    exportBlockReason: null,
    ...overrides,
  };
}
