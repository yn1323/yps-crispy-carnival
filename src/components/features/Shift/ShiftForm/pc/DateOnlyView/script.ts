import { buildWeeklyGrid, formatDateRangeShort, formatDateShort } from "@/src/domains/shift/date";
import type { WeekItem } from "./types";

export const buildDateOnlyWeeks = (dates: string[]): WeekItem[] =>
  buildWeeklyGrid(dates).map((week, index) => {
    const start = week[0]?.iso ?? "";
    const end = week[week.length - 1]?.iso ?? start;
    return {
      key: `${start}-${end}`,
      label: start === end ? formatDateShort(start) : formatDateRangeShort(start, end, "-"),
      subLabel: `${index + 1}週目`,
      dates: week,
    };
  });
