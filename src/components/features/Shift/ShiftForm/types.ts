import type { DayRequirements } from "@/convex/shiftSetup/dayTemplates";
import type { ShiftBreakRule } from "@/src/domains/shift/types";

/** その日の必要人数。サーバーと共有する形のまま持ち、時間の軸へ置くときにだけバーの形へ直す。 */
export type ShiftFormDayRequirements = DayRequirements;

/** その日の必要人数を決めた理由。確定済みの募集は、確定時に保存した内容（confirmed）だけを持つ。 */
export type ShiftFormStaffingSource = "confirmed" | "dateCustom" | "dateTemplate" | "holiday" | "weekday" | "none";

/** サーバーが解決した、1日分の必要人数。requirementsがnullの日は未設定として扱う。 */
export type ShiftFormStaffingDay = {
  date: string;
  source: ShiftFormStaffingSource;
  /** 当たっているテンプレート。その日だけの必要人数、未設定、確定済みではnull。 */
  templateId: string | null;
  templateName: string | null;
  requirements: ShiftFormDayRequirements | null;
};

/** 「くわしく」表示で使う、店舗の設定と日ごとの必要人数。 */
export type ShiftFormStaffing = {
  breakRule: ShiftBreakRule | null;
  /** 確定済みで、テンプレートの当て直しとその日だけの変更ができない。 */
  isLocked: boolean;
  /** その日に当てられるテンプレート。 */
  templates: Array<{ id: string; name: string }>;
  days: ShiftFormStaffingDay[];
};
