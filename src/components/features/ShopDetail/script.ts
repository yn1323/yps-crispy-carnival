import { MAX_SHIFT_TYPE_OPTIONS } from "@/convex/_lib/submissionPatternConstants";
import type { RegularClosedDay, ShiftSubmissionPattern, ShiftTypeOption } from "@/convex/shop/schemas";
import {
  createDefaultShiftTypeOptions,
  DEFAULT_TIME_PATTERN,
  normalizeShiftTypeOptions,
} from "@/src/components/shared/ShopSubmissionPatternForm";
import { generateShiftTimeOptions, MAX_SHIFT_TIME_MINUTES, timeToMinutes } from "@/src/domains/shift/time";
import type { ShopDetailPerson } from "./types";

export const WEEKDAYS: Array<{ value: RegularClosedDay; label: string; ariaLabel: string }> = [
  { value: "sun", label: "日", ariaLabel: "日曜日" },
  { value: "mon", label: "月", ariaLabel: "月曜日" },
  { value: "tue", label: "火", ariaLabel: "火曜日" },
  { value: "wed", label: "水", ariaLabel: "水曜日" },
  { value: "thu", label: "木", ariaLabel: "木曜日" },
  { value: "fri", label: "金", ariaLabel: "金曜日" },
  { value: "sat", label: "土", ariaLabel: "土曜日" },
];

const START_TIME_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES - 30 });
const END_TIME_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES });

export function getShopStaffs(people: readonly ShopDetailPerson[], shopId: string) {
  return people.filter((person) => person.shopIds.includes(shopId));
}

export function sortRegularClosedDays(days: RegularClosedDay[]) {
  return WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.value);
}

export function getAvailableStartTimeOptions(endTime: string) {
  const endMinutes = timeToMinutes(endTime);
  return START_TIME_OPTIONS.filter((option) => timeToMinutes(option.value) < endMinutes);
}

export function getAvailableEndTimeOptions(startTime: string) {
  const startMinutes = timeToMinutes(startTime);
  return END_TIME_OPTIONS.filter((option) => timeToMinutes(option.value) > startMinutes);
}

export function changeSubmissionPattern(
  current: ShiftSubmissionPattern,
  kind: ShiftSubmissionPattern["kind"],
): ShiftSubmissionPattern {
  if (kind === "time") {
    return current.kind === "time" ? current : { ...DEFAULT_TIME_PATTERN };
  }
  if (kind === "shiftType") {
    return current.kind === "shiftType" && current.options.length > 0
      ? current
      : { kind: "shiftType", options: createDefaultShiftTypeOptions() };
  }
  return { kind: "dateOnly" };
}

export function updateShiftTypeOption(
  pattern: ShiftSubmissionPattern,
  index: number,
  patch: Partial<ShiftTypeOption>,
): ShiftSubmissionPattern {
  if (pattern.kind !== "shiftType") return pattern;
  return {
    kind: "shiftType",
    options: normalizeShiftTypeOptions(
      pattern.options.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)),
    ),
  };
}

export function removeShiftTypeOption(pattern: ShiftSubmissionPattern, index: number): ShiftSubmissionPattern {
  if (pattern.kind !== "shiftType") return pattern;
  return {
    kind: "shiftType",
    options: normalizeShiftTypeOptions(pattern.options.filter((_, optionIndex) => optionIndex !== index)),
  };
}

export function canAddShiftTypeOption(pattern: ShiftSubmissionPattern) {
  return pattern.kind === "shiftType" && pattern.options.length < MAX_SHIFT_TYPE_OPTIONS;
}
