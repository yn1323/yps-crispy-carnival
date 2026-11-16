import type { Id } from "@/convex/_generated/dataModel";
import type { DayRequirements } from "@/convex/shiftSetup/dayTemplates";
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

/** シフト表の「くわしく」表示に使う、日ごとの必要人数、店舗の設定、スタッフの属性。 */
export type ShiftBoardStaffingData = {
  breakRule: { minWorkMinutes: number; breakMinutes: number } | null;
  staffProfiles: Array<{
    staffId: Id<"staffs">;
    unavailablePositionIds: Id<"positions">[];
    skillLevel: "newcomer" | "standard" | "lead";
  }>;
  hasPreviousConfirmedRecruitment: boolean;
  /** 確定済みで、型の当て直しとその日だけの変更ができない。 */
  isLocked: boolean;
  /** その日に当てられる型。 */
  templates: Array<{ _id: Id<"shiftDayTemplates">; name: string }>;
  /** 募集期間の全日。requirementsがnullの日は未設定として扱う。 */
  days: Array<{
    date: string;
    source: "confirmed" | "dateCustom" | "dateTemplate" | "holiday" | "weekday" | "none";
    templateId: Id<"shiftDayTemplates"> | null;
    templateName: string | null;
    requirements: DayRequirements<Id<"positions">> | null;
  }>;
};
