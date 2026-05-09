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
  };
  staffs: Array<{
    _id: Id<"staffs">;
    name: string;
    isSubmitted: boolean;
  }>;
  shiftRequests: Array<{
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
  }>;
  timeRange: TimeRange;
};
