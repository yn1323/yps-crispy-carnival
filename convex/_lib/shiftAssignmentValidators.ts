import { type Infer, v } from "convex/values";

/** 勤務中の休憩。時刻は勤務と同じ"HH:mm"で持つ。 */
export const shiftAssignmentBreakValidator = v.object({
  startTime: v.string(),
  endTime: v.string(),
});

/** staffや募集への所属を含まない、勤務内容そのものの契約。 */
export const shiftAssignmentCoreValidator = v.object({
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  positionId: v.id("positions"),
  optionId: v.optional(v.string()),
  // 省略は「休憩なし」を表す業務上の任意項目。既存の割当と確定通知snapshotのbackfillは不要。
  breaks: v.optional(v.array(shiftAssignmentBreakValidator)),
});

export type ShiftAssignmentCore = Infer<typeof shiftAssignmentCoreValidator>;

/** 保存済みの勤務から、勤務内容そのものだけを取り出す。省略できる項目は、値があるときだけ持つ。 */
export function toShiftAssignmentCore(assignment: ShiftAssignmentCore): ShiftAssignmentCore {
  return {
    date: assignment.date,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    positionId: assignment.positionId,
    ...(assignment.optionId !== undefined ? { optionId: assignment.optionId } : {}),
    ...(assignment.breaks ? { breaks: assignment.breaks } : {}),
  };
}

/** Board/Viewから返す割当DTO。 */
export const shiftAssignmentReadValidator = shiftAssignmentCoreValidator.extend({
  staffId: v.id("staffs"),
});

/** shiftAssignments tableへ保存する割当。 */
export const persistedShiftAssignmentValidator = shiftAssignmentReadValidator.extend({
  recruitmentId: v.id("recruitments"),
});

/** staff単位の確定通知snapshotにはcoreだけを保存する。 */
export const shiftConfirmationSnapshotAssignmentValidator = shiftAssignmentCoreValidator;
