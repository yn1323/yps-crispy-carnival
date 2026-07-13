import { MAX_SHIFT_TYPE_OPTIONS } from "@/convex/_lib/submissionPatternConstants";
import {
  type RegularClosedDay,
  type ShiftSubmissionPattern,
  type ShiftTypeOption,
  type UpdateShopSettingsInput,
  updateShopSettingsSchema,
} from "@/convex/shop/schemas";
import { generateShiftTimeOptions, MAX_SHIFT_TIME_MINUTES, timeToMinutes } from "@/src/domains/shift/time";
import { normalizeShiftTypeOptions } from "../submissionPatternForm";

export type { RegularClosedDay, ShiftSubmissionPattern, ShiftTypeOption };
export {
  generateShiftTimeOptions,
  MAX_SHIFT_TIME_MINUTES,
  MAX_SHIFT_TYPE_OPTIONS,
  timeToMinutes,
  updateShopSettingsSchema as editShopSchema,
};
export type EditShopFormData = UpdateShopSettingsInput;

export type EditShopFormStep = "shopName" | "submissionPattern" | "patternSettings" | "regularClosedDays";

export const WEEKDAYS: { value: RegularClosedDay; label: string; ariaLabel: string }[] = [
  { value: "sun", label: "日", ariaLabel: "日曜日" },
  { value: "mon", label: "月", ariaLabel: "月曜日" },
  { value: "tue", label: "火", ariaLabel: "火曜日" },
  { value: "wed", label: "水", ariaLabel: "水曜日" },
  { value: "thu", label: "木", ariaLabel: "木曜日" },
  { value: "fri", label: "金", ariaLabel: "金曜日" },
  { value: "sat", label: "土", ariaLabel: "土曜日" },
];

const SHIFT_START_TIME_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES - 30 });
const SHIFT_END_TIME_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES });

export const getAvailableStartTimeOptions = (endTime: string) => {
  const endMinutes = timeToMinutes(endTime);
  return SHIFT_START_TIME_OPTIONS.filter((option) => timeToMinutes(option.value) < endMinutes);
};

export const getAvailableEndTimeOptions = (startTime: string) => {
  const startMinutes = timeToMinutes(startTime);
  return SHIFT_END_TIME_OPTIONS.filter((option) => timeToMinutes(option.value) > startMinutes);
};

export const sortRegularClosedDays = (days: RegularClosedDay[]) =>
  WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.value);

export const getInitialStep = (step: EditShopFormStep, submissionPattern: ShiftSubmissionPattern): EditShopFormStep => {
  if (step === "patternSettings" && submissionPattern.kind === "dateOnly") return "regularClosedDays";
  return step;
};

export const getNextStep = (step: EditShopFormStep, submissionPattern: ShiftSubmissionPattern): EditShopFormStep => {
  if (step === "shopName") return "submissionPattern";
  if (step === "submissionPattern") {
    return submissionPattern.kind === "dateOnly" ? "regularClosedDays" : "patternSettings";
  }
  if (step === "patternSettings") return "regularClosedDays";
  return "regularClosedDays";
};

export const getPreviousStep = (
  step: EditShopFormStep,
  submissionPattern: ShiftSubmissionPattern,
): EditShopFormStep => {
  if (step === "regularClosedDays") {
    return submissionPattern.kind === "dateOnly" ? "submissionPattern" : "patternSettings";
  }
  if (step === "patternSettings") return "submissionPattern";
  if (step === "submissionPattern") return "shopName";
  return "shopName";
};

export const buildEditShopFormSubmission = (
  data: EditShopFormData,
  regularClosedDays: RegularClosedDay[],
): EditShopFormData => ({
  ...data,
  regularClosedDays: sortRegularClosedDays(regularClosedDays),
  submissionPattern:
    data.submissionPattern.kind === "shiftType"
      ? { kind: "shiftType", options: normalizeShiftTypeOptions(data.submissionPattern.options) }
      : data.submissionPattern,
});
