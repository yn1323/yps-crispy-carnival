import type { PositionSegment, ShiftData, StaffType } from "@/src/domains/shift/types";

export type DateInfo = {
  iso: string;
  inRange: boolean;
};

export type WeekItem = {
  key: string;
  label: string;
  subLabel: string;
  dates: DateInfo[];
};

export type DateOnlyColumn = {
  date: DateInfo;
  isClosed: boolean;
  assignmentCount: number;
};

export type DateOnlyCellViewModel = {
  date: DateInfo;
  assigned: boolean;
  requested: boolean;
  isClosed: boolean;
  /** その日の勤務。くわしく表示でポジションを示すために使う。 */
  segment: PositionSegment | undefined;
  /** 休憩のある勤務の日だけ持つ、その日の勤務。休憩の印に渡す。 */
  breakShift: ShiftData | undefined;
  /** 前回の勤務を仮で入れた日の勤務かどうか。 */
  isProvisional: boolean;
};

export type DateOnlyRequestBadgeViewModel = {
  key: string;
  label: string;
  tone: "warning" | "requested" | "muted";
};

export type DateOnlyRowViewModel = {
  staff: StaffType;
  isStaffNameMuted: boolean;
  warningMessages: string[];
  requestBadges: DateOnlyRequestBadgeViewModel[];
  cells: DateOnlyCellViewModel[];
};
