import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";

export type DayEntry = {
  date: string;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  optionId?: string;
  optionIds?: string[];
};

export type PreviousWeeklyPattern = {
  sourceWeekStart: string;
  days: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
  }>;
};

export type PreviousDateOnlyPattern = {
  sourceWeekStart: string;
  weekdays: number[];
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
  existingSelection: ExistingSelection;
  legalConsentRequired: boolean;
  legalDocuments: {
    terms: { title: string; documentVersion: string; requiredConsentVersion: string; path: string };
    privacy: { title: string; documentVersion: string; requiredConsentVersion: string; path: string };
  };
  timeRange: { startTime: string; endTime: string };
  previousWeeklyPattern: PreviousWeeklyPattern | null;
  previousDateOnlyPattern: PreviousDateOnlyPattern | null;
};
