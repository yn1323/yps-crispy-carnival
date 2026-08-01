import { generateShiftTimeOptions, MAX_SHIFT_TIME_MINUTES, timeToMinutes } from "@/src/domains/shift/time";

export type ShiftTypeOption = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
};

export type ShiftSubmissionPattern =
  | { kind: "dateOnly" }
  | { kind: "time"; startTime: string; endTime: string }
  | { kind: "shiftType"; options: ShiftTypeOption[] };

export const DEFAULT_TIME_PATTERN: Extract<ShiftSubmissionPattern, { kind: "time" }> = {
  kind: "time",
  startTime: "09:00",
  endTime: "22:00",
};

const DEFAULT_SHIFT_TYPE_OPTIONS: ShiftTypeOption[] = [
  { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
  { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
];

const SHIFT_START_TIME_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES - 30 });
const SHIFT_END_TIME_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES });

export const createDefaultShiftTypeOptions = (): ShiftTypeOption[] =>
  DEFAULT_SHIFT_TYPE_OPTIONS.map((option) => ({ ...option }));

export const createShiftTypeOption = (index: number, timestamp = Date.now()): ShiftTypeOption => ({
  id: `shift-type-${timestamp}-${index}`,
  name: "",
  startTime: "09:00",
  endTime: "18:00",
  sortOrder: index,
});

export const normalizeShiftTypeOptions = (options: readonly ShiftTypeOption[]): ShiftTypeOption[] =>
  options.map((option, index) => ({ ...option, sortOrder: index }));

export const updateShiftTypeOptionAt = (
  options: readonly ShiftTypeOption[],
  index: number,
  patch: Partial<ShiftTypeOption>,
): ShiftTypeOption[] =>
  normalizeShiftTypeOptions(
    options.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)),
  );

export const appendShiftTypeOption = (options: readonly ShiftTypeOption[], timestamp = Date.now()): ShiftTypeOption[] =>
  normalizeShiftTypeOptions([...options, createShiftTypeOption(options.length, timestamp)]);

export const removeShiftTypeOptionAt = (options: readonly ShiftTypeOption[], index: number): ShiftTypeOption[] =>
  normalizeShiftTypeOptions(options.filter((_, optionIndex) => optionIndex !== index));

export const selectSubmissionPattern = (
  kind: ShiftSubmissionPattern["kind"],
  current: ShiftSubmissionPattern,
): ShiftSubmissionPattern => {
  if (kind === "time") {
    return current.kind === "time" ? current : { ...DEFAULT_TIME_PATTERN };
  }
  if (kind === "shiftType") {
    return {
      kind: "shiftType",
      options:
        current.kind === "shiftType" && current.options.length > 0 ? current.options : createDefaultShiftTypeOptions(),
    };
  }
  return { kind: "dateOnly" };
};

export const getAvailableStartTimeOptions = (endTime: string) => {
  const endMinutes = timeToMinutes(endTime);
  return SHIFT_START_TIME_OPTIONS.filter((option) => timeToMinutes(option.value) < endMinutes);
};

export const getAvailableEndTimeOptions = (startTime: string) => {
  const startMinutes = timeToMinutes(startTime);
  return SHIFT_END_TIME_OPTIONS.filter((option) => timeToMinutes(option.value) > startMinutes);
};
