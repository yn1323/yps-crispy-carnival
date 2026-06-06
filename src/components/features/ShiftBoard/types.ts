import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { TimeRange } from "@/src/domains/shift/types";

export type ShiftBoardData = {
  shopId: Id<"shops">;
  recruitment: {
    _id: Id<"recruitments">;
    periodStart: string;
    periodEnd: string;
    deadline: string;
    shopClosedDates: string[];
    status: "open" | "confirmed";
    confirmedAt: number | null;
    reminderScheduledAt: number | null;
    lastReminderSentAt: number | null;
    draftSavedAt: number | null;
  };
  submissionPattern: ShiftSubmissionPattern;
  staffs: Array<{
    _id: Id<"staffs">;
    name: string;
    isSubmitted: boolean;
    wasSubmittedAtDraft: boolean;
  }>;
  requestedSlots: Array<{
    staffId: Id<"staffs">;
    date: string;
    startTime: string;
    endTime: string;
    optionId?: string | null;
  }>;
  requestedDates: Array<{
    staffId: Id<"staffs">;
    date: string;
  }>;
  shiftAssignments: Array<{
    staffId: Id<"staffs">;
    date: string;
    startTime: string;
    endTime: string;
    positionId: Id<"positions">;
    optionId?: string | null;
  }>;
  positions: Array<{
    _id: Id<"positions">;
    name: string;
    color: string;
    isDefault: boolean;
  }>;
  timeRange: TimeRange;
};
