import type { AutoCreateHistory } from "@/convex/shiftBoard/autoCreate/history";
import type { AutoCreateInput } from "@/convex/shiftBoard/autoCreate/types";
import type { PositionType, StaffType } from "@/src/domains/shift/types";
import type { ShiftBoardData, ShiftBoardStaffingData } from "../types";

type Input = {
  data: ShiftBoardData;
  staffs: readonly StaffType[];
  positions: readonly PositionType[];
  staffing: ShiftBoardStaffingData;
  history: AutoCreateHistory;
  /** 時間指定の勤務へ、休憩を入れるか。 */
  includesBreaks: boolean;
};

/**
 * シフト表が持っている希望、必要人数、熟練度を、自動作成の手順の入力へ直す。
 * 作る対象は、希望を提出済みで削除されていないスタッフと、定休日でない日だけである。
 */
export const toAutoCreateInput = ({
  data,
  staffs,
  positions,
  staffing,
  history,
  includesBreaks,
}: Input): AutoCreateInput => {
  const closedDates = new Set(data.recruitment.shopClosedDates);
  return {
    pattern: data.submissionPattern,
    periodStart: data.recruitment.periodStart,
    dates: staffing.days.map((day) => day.date).filter((date) => !closedDates.has(date)),
    staffs: staffs
      .filter((staff) => staff.isSubmitted && !staff.isRemoved)
      .map((staff) => ({ id: staff.id, positionSkills: staff.positionSkills ?? [] })),
    positionIds: positions.map((position) => position.id),
    requestedSlots: data.requestedSlots.map((request) => ({
      staffId: request.staffId,
      date: request.date,
      startTime: request.startTime,
      endTime: request.endTime,
      ...(request.optionId ? { optionId: request.optionId } : {}),
    })),
    requestedDates: data.requestedDates,
    days: staffing.days.map((day) => ({ date: day.date, requirements: day.requirements })),
    history: history.recruitmentCount > 0 ? history : null,
    includesBreaks,
  };
};
