import { DAY_COUNT, DAY_LABELS } from "../constants";
import { createStaffingKey } from "./staffingMapHelpers";

type SummaryInput = {
  staffingMap: Record<string, number>;
  hours: number[];
  positions: { name: string }[];
};

type SummaryResult = {
  weeklyTotalPersonHours: number;
  peakInfo: { day: string; hour: string; count: number } | null;
  configuredDaysCount: number;
};

export const calculateWeeklySummary = ({ staffingMap, hours, positions }: SummaryInput): SummaryResult => {
  let weeklyTotal = 0;
  let peakCount = 0;
  let peakDay = 0;
  let peakHour = 0;
  let configuredDays = 0;

  for (let day = 0; day < DAY_COUNT; day++) {
    let dayHasData = false;
    for (const hour of hours) {
      let hourTotal = 0;
      for (const position of positions) {
        const key = createStaffingKey(day, hour, position.name);
        const count = staffingMap[key] ?? 0;
        hourTotal += count;
        weeklyTotal += count;
        if (count > 0) dayHasData = true;
      }
      if (hourTotal > peakCount) {
        peakCount = hourTotal;
        peakDay = day;
        peakHour = hour;
      }
    }
    if (dayHasData) configuredDays++;
  }

  return {
    weeklyTotalPersonHours: weeklyTotal,
    peakInfo: peakCount > 0 ? { day: DAY_LABELS[peakDay], hour: `${peakHour}:00`, count: peakCount } : null,
    configuredDaysCount: configuredDays,
  };
};
