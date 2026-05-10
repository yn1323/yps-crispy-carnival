import type { Id } from "@/convex/_generated/dataModel";
import type { TimeRange } from "@/src/domains/shift/types";

export type ShiftBoardData = {
  shopId: Id<"shops">;
  recruitment: {
    _id: Id<"recruitments">;
    periodStart: string;
    periodEnd: string;
    deadline: string;
    status: "open" | "confirmed";
    confirmedAt: number | null;
    lastReminderSentAt: number | null;
    draftSavedAt: number | null;
  };
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
  }>;
  shiftAssignments: Array<{
    staffId: Id<"staffs">;
    date: string;
    startTime: string;
    endTime: string;
    positionId: Id<"positions">;
  }>;
  positions: Array<{
    _id: Id<"positions">;
    name: string;
    color: string;
    isDefault: boolean;
  }>;
  timeRange: TimeRange;
};
