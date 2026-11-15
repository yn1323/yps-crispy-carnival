import { v } from "convex/values";

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

/** Board/Viewから返す割当DTO。 */
export const shiftAssignmentReadValidator = shiftAssignmentCoreValidator.extend({
  staffId: v.id("staffs"),
});

/** 管理者のシフト表だけが扱う割当DTO。仮の勤務の印はスタッフ向けの閲覧へ返さない。 */
export const shiftBoardAssignmentValidator = shiftAssignmentReadValidator.extend({
  isProvisional: v.optional(v.boolean()),
});

/** shiftAssignments tableへ保存する割当。 */
export const persistedShiftAssignmentValidator = shiftAssignmentReadValidator.extend({
  recruitmentId: v.id("recruitments"),
  // 未提出者へ前回確定の勤務を引き継いだ「仮の勤務」。省略は通常の勤務を表し、backfillは不要。
  isProvisional: v.optional(v.boolean()),
});

/** staff単位の確定通知snapshotにはcoreだけを保存する。 */
export const shiftConfirmationSnapshotAssignmentValidator = shiftAssignmentCoreValidator;
