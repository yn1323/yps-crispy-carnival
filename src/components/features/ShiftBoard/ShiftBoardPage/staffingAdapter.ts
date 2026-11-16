import type { Id } from "@/convex/_generated/dataModel";
import type { DayRequirements } from "@/convex/shiftSetup/dayTemplates";
import type { ShiftFormDayRequirements, ShiftFormStaffing } from "@/src/components/features/Shift/ShiftForm";
import type { ShiftBreakRule } from "@/src/domains/shift/types";
import type { ShiftBoardStaffingData } from "../types";

// シフト表のqueryとmutationの形を、ShiftFormが受け渡す形へ直す境界。

/**
 * サーバーが解決した日ごとの必要人数を、ShiftFormへ渡す形にする。
 * 日ごとの必要人数はそのまま渡し、型のIDだけをShiftFormの名前へ直す。
 * 休憩の決まりは、値が同じ間は同じ参照を保つため、呼び出し元でまとめたものを受け取る。
 */
export const toShiftFormStaffing = (
  staffing: Pick<ShiftBoardStaffingData, "isLocked" | "templates" | "days">,
  breakRule: ShiftBreakRule | null,
): ShiftFormStaffing => ({
  breakRule,
  isLocked: staffing.isLocked,
  templates: staffing.templates.map((template) => ({ id: template._id, name: template.name })),
  days: staffing.days.map((day) => ({
    date: day.date,
    source: day.source,
    templateId: day.templateId,
    templateName: day.templateName,
    requirements: day.requirements,
  })),
});

/** ShiftFormが返す型のIDを、mutationの引数へ直す。nullは、その日だけの指定を消すことを表す。 */
export const toDayTemplateIdArg = (templateId: string | null): Id<"shiftDayTemplates"> | null =>
  templateId as Id<"shiftDayTemplates"> | null;

/** ShiftFormが返す必要人数を、mutationの引数へ直す。ポジションの所属はサーバーが確かめる。 */
export const toDayRequirementsArg = (requirements: ShiftFormDayRequirements): DayRequirements<Id<"positions">> =>
  requirements as DayRequirements<Id<"positions">>;
