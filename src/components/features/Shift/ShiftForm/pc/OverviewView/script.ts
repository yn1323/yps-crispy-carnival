import dayjs from "dayjs";
import { getEffectiveBreaks, getWorkedMinutes } from "@/src/domains/shift/breaks";
import { buildWeeklyGrid, formatDateShort, getWeekdayLabel, type WeekStart } from "@/src/domains/shift/date";
import { isCanonicalWorkPosition } from "@/src/domains/shift/positions";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { PositionSegment, ShiftData, StaffType } from "@/src/domains/shift/types";
import { formatStaffWorkTotal } from "@/src/domains/shift/workTotals";
import { getShiftWeekdayColor } from "../../weekdayPresentation";

export type OverviewDateViewModel = {
  iso: string;
  label: string;
  weekdayLabel: string;
  weekdayColor: string;
  inRange: boolean;
  isClosed: boolean;
  isClickable: boolean;
  warningCount: number;
};

export type OverviewCellViewModel = {
  key: string;
  text: string;
  tone: "closed" | "assigned" | "empty" | "outOfRange";
  /** その日の勤務のポジション。同じポジションは1つにまとめ、開始順に並べる。勤務のない日は空。 */
  positions: PositionSegment[];
  /** 休憩のある勤務の日だけ持つ、その日の勤務。休憩の印に渡す。 */
  breakShift: ShiftData | undefined;
};

export type OverviewStaffRowViewModel = {
  key: string;
  staff: StaffType;
  name: string;
  isUnsubmitted: boolean;
  cells: OverviewCellViewModel[];
  totalLabel: string;
  hasTotal: boolean;
};

export type OverviewWeekViewModel = {
  key: string;
  rangeLabel: string;
  dates: OverviewDateViewModel[];
  rows: OverviewStaffRowViewModel[];
};

const getAssignedRange = (shift: ShiftData): [string, string] | null => {
  if (shift.positions.length === 0) return null;
  const sorted = [...shift.positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return [sorted[0].start, sorted[sorted.length - 1].end];
};

// くわしく表示でセルに出す、その日の勤務のポジション。
const getDistinctWorkPositions = (shift: ShiftData): PositionSegment[] => {
  const seen = new Set<string>();
  return shift.positions
    .filter(isCanonicalWorkPosition)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    .filter((segment) => {
      if (seen.has(segment.positionId)) return false;
      seen.add(segment.positionId);
      return true;
    });
};

const NO_DETAIL = { positions: [], breakShift: undefined } satisfies Pick<
  OverviewCellViewModel,
  "positions" | "breakShift"
>;

export const buildOverviewWeeks = ({
  dates,
  weekStart,
  holidays,
  isReadOnly,
  staffs,
  shifts,
  warningCounts,
}: {
  dates: string[];
  weekStart: WeekStart;
  holidays: string[];
  isReadOnly: boolean;
  staffs: StaffType[];
  shifts: ShiftData[];
  warningCounts: ReadonlyMap<string, number>;
}): OverviewWeekViewModel[] => {
  const assignedByStaffDate = new Map<string, { shift: ShiftData; range: [string, string] }>();
  for (const shift of shifts) {
    const range = getAssignedRange(shift);
    if (range) assignedByStaffDate.set(`${shift.staffId}-${shift.date}`, { shift, range });
  }

  return buildWeeklyGrid(dates, weekStart).map((week) => {
    const dateViewModels = week.map((date): OverviewDateViewModel => {
      const isClosed = date.inRange && holidays.includes(date.iso);
      return {
        iso: date.iso,
        label: `${dayjs(date.iso).month() + 1}/${dayjs(date.iso).date()}`,
        weekdayLabel: getWeekdayLabel(date.iso),
        weekdayColor: getShiftWeekdayColor(date.iso),
        inRange: date.inRange,
        isClosed,
        isClickable: !isReadOnly && date.inRange,
        warningCount: warningCounts.get(date.iso) ?? 0,
      };
    });
    const start = dateViewModels[0]?.iso ?? "";
    const end = dateViewModels[dateViewModels.length - 1]?.iso ?? start;

    return {
      key: start,
      rangeLabel: start === end ? formatDateShort(start) : `${formatDateShort(start)} – ${formatDateShort(end)}`,
      dates: dateViewModels,
      rows: staffs.map((staff): OverviewStaffRowViewModel => {
        // 週の「計」は、勤務時間の合計から休憩を引いた時間にする。勤務と勤務の隙間は数えない。
        let totalMinutes = 0;
        const cells = dateViewModels.map((date): OverviewCellViewModel => {
          if (date.isClosed) return { key: date.iso, text: "定休日", tone: "closed", ...NO_DETAIL };
          if (!date.inRange) return { key: date.iso, text: "—", tone: "outOfRange", ...NO_DETAIL };
          const assigned = assignedByStaffDate.get(`${staff.id}-${date.iso}`);
          if (!assigned) return { key: date.iso, text: "—", tone: "empty", ...NO_DETAIL };
          const { shift, range } = assigned;
          totalMinutes += getWorkedMinutes(shift);
          return {
            key: date.iso,
            text: `${formatShiftClockTime(range[0])}–${formatShiftClockTime(range[1])}`,
            tone: "assigned",
            positions: getDistinctWorkPositions(shift),
            breakShift: getEffectiveBreaks(shift, { clipToWork: true }).length > 0 ? shift : undefined,
          };
        });

        return {
          key: staff.id,
          staff,
          name: staff.name,
          isUnsubmitted: !staff.isSubmitted,
          cells,
          totalLabel: totalMinutes > 0 ? formatStaffWorkTotal({ kind: "minutes", minutes: totalMinutes }) : "—",
          hasTotal: totalMinutes > 0,
        };
      }),
    };
  });
};
