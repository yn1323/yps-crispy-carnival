import type { LegalDocumentLinks } from "@/convex/legal/documents";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";

export type DayEntry = {
  date: string;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  optionId?: string;
  optionIds?: string[];
};

/** 前回の週に添えた日付メモ。曜日ごとに今回の日付へ写す。 */
export type PreviousWeekdayNote = {
  weekday: number;
  note: string;
};

export type PreviousWeeklyPattern = {
  sourceWeekStart: string;
  days: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
  }>;
  notes: PreviousWeekdayNote[];
};

export type PreviousDateOnlyPattern = {
  sourceWeekStart: string;
  weekdays: number[];
  notes: PreviousWeekdayNote[];
};

type ExistingSelection =
  | { kind: "time"; requests: Array<{ date: string; startTime: string; endTime: string }> }
  | {
      kind: "dateOnly";
      workingDates: string[];
      unmatchedRequests?: Array<{ date: string; startTime: string; endTime: string }>;
    }
  | {
      kind: "shiftType";
      selections: Array<{ date: string; optionId: string }>;
      unmatchedRequests?: Array<{ date: string; startTime: string; endTime: string }>;
    };

export type SubmissionData = {
  editVersion?: number;
  shopName: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  shopClosedDates: string[];
  submissionPattern: ShiftSubmissionPattern;
  isBeforeDeadline: boolean;
  hasSubmitted: boolean;
  existingRequests: { date: string; startTime: string; endTime: string }[];
  existingDateNotes?: { date: string; note: string }[];
  existingSelection: ExistingSelection;
  legalConsentRequired: boolean;
  legalDocuments: LegalDocumentLinks;
  timeRange: { startTime: string; endTime: string };
  previousWeeklyPattern: PreviousWeeklyPattern | null;
  previousDateOnlyPattern: PreviousDateOnlyPattern | null;
};
