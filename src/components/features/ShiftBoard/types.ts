import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { TimeRange } from "@/src/domains/shift/types";

export type ShiftBoardData = {
  shopId: Id<"shops">;
  exportStaffOrder?: Id<"staffs">[];
  canWriteBusinessData: boolean;
  businessWriteBlockReason: "paymentResultPending" | "usageLimitExceeded" | "usageLimitEvaluationUnavailable" | null;
  recruitment: {
    editVersion?: number;
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
    isRemoved?: boolean;
    isSubmitted: boolean;
    createdAt?: number;
    wasSubmittedAtDraft: boolean;
    /** 有効な管理者かどうか。未提出の管理者へシフト対象外の設定を案内するために使う。 */
    isManager?: boolean;
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
    breaks?: Array<{ startTime: string; endTime: string }>;
    isProvisional?: boolean;
  }>;
  positions: Array<{
    _id: Id<"positions">;
    name: string;
    color: string;
    isDefault: boolean;
  }>;
  timeRange: TimeRange;
};

/** シフト表の「くわしく」表示に使う、店舗の設定とスタッフの属性。 */
export type ShiftBoardStaffingData = {
  breakRule: { minWorkMinutes: number; breakMinutes: number } | null;
  dayTemplates: Array<{
    _id: Id<"shiftDayTemplates">;
    name: string;
    weekdays: string[];
    slots: Array<{
      key:
        | { kind: "time"; startTime: string; endTime: string }
        | { kind: "shiftType"; optionId: string }
        | { kind: "allDay" };
      requirements: Array<{ positionId: Id<"positions">; count: number }>;
    }>;
  }>;
  dayTemplateOverrides: Array<{ date: string; templateId: Id<"shiftDayTemplates"> }>;
  staffProfiles: Array<{
    staffId: Id<"staffs">;
    unavailablePositionIds: Id<"positions">[];
    skillLevel: "newcomer" | "standard" | "lead";
  }>;
  hasPreviousConfirmedRecruitment: boolean;
};
