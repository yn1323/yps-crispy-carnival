import { MAX_SHIFT_TYPE_OPTIONS } from "@/convex/_lib/submissionPatternConstants";
import {
  type RegularClosedDay,
  type ShiftSubmissionPattern,
  type ShiftTypeOption,
  type UpdateShopSettingsInput,
  updateShopSettingsSchema,
} from "@/convex/shop/schemas";
import { normalizeShiftTypeOptions } from "@/src/domains/shop/submissionPattern";

export type { RegularClosedDay, ShiftSubmissionPattern, ShiftTypeOption };
export { MAX_SHIFT_TYPE_OPTIONS, updateShopSettingsSchema as shopFormSchema };
export type ShopFormData = UpdateShopSettingsInput;

export type ShopFormStep = "shopName" | "submissionPattern" | "patternSettings" | "regularClosedDays";

export const WEEKDAYS: { value: RegularClosedDay; label: string; ariaLabel: string }[] = [
  { value: "sun", label: "日", ariaLabel: "日曜日" },
  { value: "mon", label: "月", ariaLabel: "月曜日" },
  { value: "tue", label: "火", ariaLabel: "火曜日" },
  { value: "wed", label: "水", ariaLabel: "水曜日" },
  { value: "thu", label: "木", ariaLabel: "木曜日" },
  { value: "fri", label: "金", ariaLabel: "金曜日" },
  { value: "sat", label: "土", ariaLabel: "土曜日" },
];

export const sortRegularClosedDays = (days: RegularClosedDay[]) =>
  WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.value);

export const getInitialStep = (step: ShopFormStep, submissionPattern: ShiftSubmissionPattern): ShopFormStep => {
  if (step === "patternSettings" && submissionPattern.kind === "dateOnly") return "regularClosedDays";
  return step;
};

export const getNextStep = (step: ShopFormStep, submissionPattern: ShiftSubmissionPattern): ShopFormStep => {
  if (step === "shopName") return "submissionPattern";
  if (step === "submissionPattern") {
    return submissionPattern.kind === "dateOnly" ? "regularClosedDays" : "patternSettings";
  }
  if (step === "patternSettings") return "regularClosedDays";
  return "regularClosedDays";
};

export const getPreviousStep = (step: ShopFormStep, submissionPattern: ShiftSubmissionPattern): ShopFormStep => {
  if (step === "regularClosedDays") {
    return submissionPattern.kind === "dateOnly" ? "submissionPattern" : "patternSettings";
  }
  if (step === "patternSettings") return "submissionPattern";
  if (step === "submissionPattern") return "shopName";
  return "shopName";
};

export const buildShopFormSubmission = (data: ShopFormData, regularClosedDays: RegularClosedDay[]): ShopFormData => ({
  ...data,
  regularClosedDays: sortRegularClosedDays(regularClosedDays),
  submissionPattern:
    data.submissionPattern.kind === "shiftType"
      ? { kind: "shiftType", options: normalizeShiftTypeOptions(data.submissionPattern.options) }
      : data.submissionPattern,
});
