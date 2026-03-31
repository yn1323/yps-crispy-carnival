import dayjs from "dayjs";

/** 来週月曜〜日曜の日付と今週金曜（締切）を返す */
export function getNextWeekDates() {
  const today = dayjs();
  const currentDay = today.day(); // 0=Sun, 1=Mon...
  const daysUntilNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
  const nextMonday = today.add(daysUntilNextMonday, "day");

  return {
    periodStart: nextMonday.format("YYYY-MM-DD"),
    periodEnd: nextMonday.add(6, "day").format("YYYY-MM-DD"),
    deadline: nextMonday.subtract(3, "day").format("YYYY-MM-DD"),
    dates: Array.from({ length: 7 }, (_, i) => nextMonday.add(i, "day").format("YYYY-MM-DD")),
  };
}
