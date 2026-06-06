import dayjs from "dayjs";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 月曜〜日曜の日付と前日締切を返す。提出締切前日17:00の自動催促も未来になる週を選ぶ。 */
export function getNextWeekDates() {
  const today = dayjs();
  const currentDay = today.day(); // 0=Sun, 1=Mon...
  const daysUntilNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
  let nextMonday = today.add(daysUntilNextMonday, "day");
  const reminderScheduledAt = nextMonday.subtract(2, "day").hour(17).minute(0).second(0).millisecond(0);
  if (!reminderScheduledAt.isAfter(today)) {
    nextMonday = nextMonday.add(7, "day");
  }

  return {
    periodStart: nextMonday.format("YYYY-MM-DD"),
    periodEnd: nextMonday.add(6, "day").format("YYYY-MM-DD"),
    deadline: nextMonday.subtract(1, "day").format("YYYY-MM-DD"),
    dates: Array.from({ length: 7 }, (_, i) => nextMonday.add(i, "day").format("YYYY-MM-DD")),
  };
}

export function formatDateWithWeekday(date: string) {
  const d = dayjs(date);
  return `${d.month() + 1}/${d.date()}(${WEEKDAYS[d.day()]})`;
}
