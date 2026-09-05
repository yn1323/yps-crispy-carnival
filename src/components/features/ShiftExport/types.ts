import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";

export type ShiftExportData = {
  shopName: string;
  recruitment: {
    periodStart: string;
    periodEnd: string;
    shopClosedDates: string[];
    submissionPattern: ShiftSubmissionPattern;
    draftSavedAt: number | null;
    confirmedAt: number | null;
    isConfirmed: boolean;
  };
  staffs: { id: string; name: string; isRemoved: boolean }[];
  assignments: {
    staffId: string;
    date: string;
    startTime: string;
    endTime: string;
    optionId: string | null;
  }[];
  confirmationState: "unconfirmed" | "confirmed";
  contentComparison: "notApplicable" | "same" | "different" | "unknown";
  notificationState: "notApplicable" | "pending" | "failed" | "sent" | "unknown";
  exportBlockReason: "noStaffs" | "excludedStaffAssignments" | null;
};

export type ExportDate = {
  date: string;
  label: string;
  dayOfWeek: number;
  isClosed: boolean;
};

export type ExportStaffRow = {
  staffId: string;
  staffName: string;
  cells: { lines: string[] }[];
};

/** The full text is retained here; only the preview and PDF may abbreviate it. */
export type ExportSchedule = {
  shopName: string;
  periodStart: string;
  periodEnd: string;
  statusLabel: string;
  notificationLabel: string | null;
  mode: ShiftSubmissionPattern["kind"];
  splitPeriod: boolean;
  bodyLineCount: number;
  dates: ExportDate[];
  rows: ExportStaffRow[];
};
