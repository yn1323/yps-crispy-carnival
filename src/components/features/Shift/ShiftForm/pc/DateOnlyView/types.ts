import type { StaffType } from "@/src/domains/shift/types";

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
