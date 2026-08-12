import { v } from "convex/values";

/** staffや募集への所属を含まない、勤務内容そのものの契約。 */
export const shiftAssignmentCoreValidator = v.object({
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  positionId: v.id("positions"),
  optionId: v.optional(v.string()),
});

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
