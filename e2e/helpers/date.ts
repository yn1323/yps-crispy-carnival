const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const JST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

/** 月曜〜日曜の日付と前日締切を返す。提出締切前日17:00の自動催促も未来になる週を選ぶ。 */
export function getNextWeekDates(now: Date | number = Date.now()) {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const today = getJstCalendarDate(nowMs);
  const currentDay = toUtcCalendarDate(today).getUTCDay();
  const daysUntilNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
  let nextMonday = addCalendarDays(today, daysUntilNextMonday);
  const reminderDate = addCalendarDays(nextMonday, -2);
  const reminderScheduledAt =
    Date.UTC(reminderDate.year, reminderDate.month - 1, reminderDate.day, 17, 0, 0, 0) - JST_OFFSET_MS;
  if (reminderScheduledAt <= nowMs) nextMonday = addCalendarDays(nextMonday, 7);

  return {
    periodStart: formatCalendarDate(nextMonday),
    periodEnd: formatCalendarDate(addCalendarDays(nextMonday, 6)),
    deadline: formatCalendarDate(addCalendarDays(nextMonday, -1)),
    dates: Array.from({ length: 7 }, (_, index) => formatCalendarDate(addCalendarDays(nextMonday, index))),
  };
}

export function formatDateWithWeekday(date: string) {
  const calendarDate = parseCalendarDate(date);
  return `${calendarDate.month}/${calendarDate.day}(${WEEKDAYS[toUtcCalendarDate(calendarDate).getUTCDay()]})`;
}

function getJstCalendarDate(nowMs: number): CalendarDate {
  const parts = Object.fromEntries(
    JST_DATE_FORMATTER.formatToParts(new Date(nowMs)).map((part) => [part.type, part.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function parseCalendarDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid calendar date: ${value}`);
  const calendarDate = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const normalized = formatCalendarDate(getCalendarDateFromUtc(toUtcCalendarDate(calendarDate)));
  if (normalized !== value) throw new Error(`Invalid calendar date: ${value}`);
  return calendarDate;
}

function addCalendarDays(value: CalendarDate, days: number): CalendarDate {
  const date = toUtcCalendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return getCalendarDateFromUtc(date);
}

function toUtcCalendarDate(value: CalendarDate) {
  return new Date(Date.UTC(value.year, value.month - 1, value.day));
}

function getCalendarDateFromUtc(date: Date): CalendarDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function formatCalendarDate(value: CalendarDate) {
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}
