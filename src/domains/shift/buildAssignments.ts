import { BREAK_POSITION, DEFAULT_POSITION } from "./constants";
import type { ShiftData } from "./types";

export type ShiftAssignmentDraft<StaffId extends string = string, PositionId extends string = string> = {
  staffId: StaffId;
  date: string;
  startTime: string;
  endTime: string;
  optionId?: string;
  positionId?: PositionId;
};

// ShiftFormの編集状態をmutation引数のassignmentsに変換する。
// 定休日セルと休憩（BREAK）は保存対象から除外し、デフォルトポジションはサーバー側の補完に任せる。
export const buildAssignments = <StaffId extends string = string, PositionId extends string = string>(
  shifts: ShiftData[],
  closedDateSet: ReadonlySet<string>,
): ShiftAssignmentDraft<StaffId, PositionId>[] =>
  shifts.flatMap((s) => {
    if (closedDateSet.has(s.date)) return [];
    return s.positions
      .filter((position) => position.positionId !== BREAK_POSITION.id)
      .map((position) => ({
        staffId: s.staffId as StaffId,
        date: s.date,
        startTime: position.start,
        endTime: position.end,
        ...(position.shiftTypeOptionId ? { optionId: position.shiftTypeOptionId } : {}),
        ...(position.positionId !== DEFAULT_POSITION.id ? { positionId: position.positionId as PositionId } : {}),
      }));
  });
