import dayjs from "dayjs";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { buildWeeklyGrid, formatDateShort, getWeekdayLabel, type WeekStart } from "@/src/domains/shift/date";
import { getAssignedShiftTypeOptionIdsInOptionOrder } from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { getShiftTypeOptionColor } from "../../shiftTypeOptionStyles";

export type ShiftTypeOverviewAssignmentBadgeViewModel = {
  key: string;
  label: string;
  bg: string;
  color: string;
};

export type ShiftTypeOverviewCellContentViewModel =
  | {
      kind: "closed";
      label: "定休日";
    }
  | {
      kind: "assignments";
      badges: ShiftTypeOverviewAssignmentBadgeViewModel[];
    }
  | {
      kind: "status";
      label: "未提出" | "—";
      tone: "unsubmitted" | "empty" | "outOfRange";
    };

export type ShiftTypeOverviewCellViewModel = {
  key: string;
  isClosed: boolean;
  content: ShiftTypeOverviewCellContentViewModel;
};

export type ShiftTypeOverviewRowViewModel = {
  key: string;
  staffName: string;
  isStaffNameMuted: boolean;
  cells: ShiftTypeOverviewCellViewModel[];
};

export type ShiftTypeOverviewDateViewModel = {
  key: string;
  iso: string;
  label: string;
  weekdayLabel: string;
  weekdayColor: string;
  opacity: number;
  isClickable: boolean;
  isClosed: boolean;
  warningCount: number;
  rangeStatusLabel: "期間外" | null;
};

export type ShiftTypeOverviewWeekViewModel = {
  key: string;
  index: number;
  rangeLabel: string;
  dates: ShiftTypeOverviewDateViewModel[];
  rows: ShiftTypeOverviewRowViewModel[];
};

export type ShiftTypeOverviewViewModel = {
  weeks: ShiftTypeOverviewWeekViewModel[];
};

const getWeekdayColor = (iso: string): string => {
  const day = dayjs(iso).day();
  if (day === 0) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

const buildWeekRangeLabel = (dates: { iso: string }[]): string => {
  const start = dates[0]?.iso ?? "";
  const end = dates[dates.length - 1]?.iso ?? start;
  return start === end ? formatDateShort(start) : `${formatDateShort(start)} – ${formatDateShort(end)}`;
};

export const buildShiftTypeOverviewViewModel = ({
  dates,
  weekStart,
  holidays,
  isReadOnly,
  staffs,
  shifts,
  submissionPattern,
  warningCounts,
}: {
  dates: string[];
  weekStart: WeekStart;
  holidays: string[];
  isReadOnly: boolean;
  staffs: StaffType[];
  shifts: ShiftData[];
  submissionPattern: ShiftSubmissionPattern;
  warningCounts: ReadonlyMap<string, number>;
}): ShiftTypeOverviewViewModel => {
  const options =
    submissionPattern.kind === "shiftType"
      ? [...submissionPattern.options].sort((a, b) => a.sortOrder - b.sortOrder)
      : [];
  const sortedOptionIds = options.map((option) => option.id);
  const optionDisplayById = new Map(
    options.map((option, index) => [
      option.id,
      {
        name: option.name,
        color: getShiftTypeOptionColor(index),
      },
    ]),
  );
  const shiftByStaffDate = new Map(shifts.map((shift) => [`${shift.staffId}-${shift.date}`, shift]));

  const weeks = buildWeeklyGrid(dates, weekStart).flatMap<ShiftTypeOverviewWeekViewModel>((weekDates, weekIndex) => {
    if (weekDates.length === 0) return [];

    const dateViewModels = weekDates.map((date) => {
      const isClosed = date.inRange && holidays.includes(date.iso);
      return {
        key: date.iso,
        iso: date.iso,
        label: formatDateShort(date.iso),
        weekdayLabel: getWeekdayLabel(date.iso),
        weekdayColor: getWeekdayColor(date.iso),
        opacity: date.inRange ? 1 : 0.35,
        isClickable: !isReadOnly && date.inRange,
        isClosed,
        warningCount: warningCounts.get(date.iso) ?? 0,
        rangeStatusLabel: date.inRange ? null : ("期間外" as const),
      };
    });

    return [
      {
        key: weekDates[0].iso,
        index: weekIndex,
        rangeLabel: buildWeekRangeLabel(weekDates),
        dates: dateViewModels,
        rows: staffs.map((staff) => ({
          key: staff.id,
          staffName: staff.name,
          isStaffNameMuted: !staff.isSubmitted,
          cells: dateViewModels.map((date) => {
            if (date.isClosed) {
              return {
                key: date.key,
                isClosed: true,
                content: { kind: "closed" as const, label: "定休日" as const },
              };
            }

            const shift = shiftByStaffDate.get(`${staff.id}-${date.iso}`);
            const assignedOptionIds = date.rangeStatusLabel
              ? []
              : getAssignedShiftTypeOptionIdsInOptionOrder(shift, sortedOptionIds);

            if (assignedOptionIds.length > 0) {
              return {
                key: date.key,
                isClosed: false,
                content: {
                  kind: "assignments" as const,
                  badges: assignedOptionIds.map((optionId) => {
                    const optionDisplay = optionDisplayById.get(optionId);
                    return {
                      key: optionId,
                      label: optionDisplay?.name ?? "勤務",
                      bg: optionDisplay?.color.requestedBg ?? "teal.50",
                      color: optionDisplay?.color.accent ?? "teal.700",
                    };
                  }),
                },
              };
            }

            if (!staff.isSubmitted) {
              return {
                key: date.key,
                isClosed: false,
                content: { kind: "status" as const, label: "未提出" as const, tone: "unsubmitted" as const },
              };
            }

            return {
              key: date.key,
              isClosed: false,
              content: {
                kind: "status" as const,
                label: "—" as const,
                tone: date.rangeStatusLabel ? ("outOfRange" as const) : ("empty" as const),
              },
            };
          }),
        })),
      },
    ];
  });

  return { weeks };
};
