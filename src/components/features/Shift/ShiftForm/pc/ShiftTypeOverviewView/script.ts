import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getEffectiveBreaks, getWorkedMinutes } from "@/src/domains/shift/breaks";
import { buildWeeklyGrid, formatDateShort, getWeekdayLabel, type WeekStart } from "@/src/domains/shift/date";
import { getAssignedShiftTypeOptionIdsInOptionOrder } from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { formatStaffWorkTotal } from "@/src/domains/shift/workTotals";
import { getOrderedShiftTypeOptions } from "@/src/domains/shop/submissionPattern";
import { getShiftTypeOptionColor } from "../../shiftTypeOptionStyles";
import { getShiftWeekdayColor } from "../../weekdayPresentation";

export type ShiftTypeOverviewAssignmentBadgeViewModel = {
  key: string;
  label: string;
  bg: string;
  color: string;
  /** その勤務パターンに入っている勤務のポジション。くわしく表示で、勤務パターンの下に添える。 */
  position: { positionId: string; positionName: string; color: string } | null;
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
  /** 休憩のある勤務の日だけ持つ、その日の勤務。休憩の印に渡す。 */
  breakShift: ShiftData | undefined;
};

export type ShiftTypeOverviewRowViewModel = {
  key: string;
  staff: StaffType;
  staffName: string;
  isStaffNameMuted: boolean;
  cells: ShiftTypeOverviewCellViewModel[];
  /** その週の勤務時間の合計（休憩を引く）。くわしく表示の「計」の列に出す。 */
  totalLabel: string;
  hasTotal: boolean;
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
  const options = getOrderedShiftTypeOptions(submissionPattern);
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
        weekdayColor: getShiftWeekdayColor(date.iso),
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
        rows: staffs.map((staff) => {
          let totalMinutes = 0;
          const cells = dateViewModels.map((date): ShiftTypeOverviewCellViewModel => {
            if (date.isClosed) {
              return {
                key: date.key,
                isClosed: true,
                content: { kind: "closed" as const, label: "定休日" as const },
                breakShift: undefined,
              };
            }

            const shift = shiftByStaffDate.get(`${staff.id}-${date.iso}`);
            const assignedOptionIds = date.rangeStatusLabel
              ? []
              : getAssignedShiftTypeOptionIdsInOptionOrder(shift, sortedOptionIds);

            if (shift && assignedOptionIds.length > 0) {
              totalMinutes += getWorkedMinutes(shift);
              return {
                key: date.key,
                isClosed: false,
                content: {
                  kind: "assignments" as const,
                  badges: assignedOptionIds.map((optionId) => {
                    const optionDisplay = optionDisplayById.get(optionId);
                    const segment = shift.positions.find((position) => position.shiftTypeOptionId === optionId);
                    return {
                      key: optionId,
                      label: optionDisplay?.name ?? "勤務",
                      bg: optionDisplay?.color.requestedBg ?? "teal.50",
                      color: optionDisplay?.color.accent ?? "teal.700",
                      position: segment
                        ? { positionId: segment.positionId, positionName: segment.positionName, color: segment.color }
                        : null,
                    };
                  }),
                },
                breakShift: getEffectiveBreaks(shift, { clipToWork: true }).length > 0 ? shift : undefined,
              };
            }

            if (!staff.isSubmitted) {
              return {
                key: date.key,
                isClosed: false,
                content: { kind: "status" as const, label: "未提出" as const, tone: "unsubmitted" as const },
                breakShift: undefined,
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
              breakShift: undefined,
            };
          });

          return {
            key: staff.id,
            staff,
            staffName: staff.name,
            isStaffNameMuted: !staff.isSubmitted,
            cells,
            totalLabel: totalMinutes > 0 ? formatStaffWorkTotal({ kind: "minutes", minutes: totalMinutes }) : "—",
            hasTotal: totalMinutes > 0,
          };
        }),
      },
    ];
  });

  return { weeks };
};
