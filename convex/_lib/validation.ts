import { z } from "zod";
import { DAY_MS, EMAIL_MAX_LENGTH } from "../constants";
import { dateToUtcMs } from "./dateFormat";
import { isSupportedShiftTime } from "./time";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type TextSchemaOptions = {
  label: string;
  maxLength: number;
  requiredMessage?: string;
};

export function hasControlCharacter(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

export function requiredDisplayTextSchema({
  label,
  maxLength,
  requiredMessage = `${label}を入力してください`,
}: TextSchemaOptions) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(maxLength, `${label}は${maxLength}文字以内で入力してください`)
    .refine((value) => !hasControlCharacter(value), {
      message: `${label}に使用できない文字が含まれています`,
    });
}

export const requiredEmailSchema = z
  .string()
  .trim()
  .min(1, "メールアドレスを入力してください")
  .max(EMAIL_MAX_LENGTH, `メールアドレスは${EMAIL_MAX_LENGTH}文字以内で入力してください`)
  .email("メールアドレスの形式で入力してください")
  .refine((value) => !hasControlCharacter(value), {
    message: "メールアドレスに使用できない文字が含まれています",
  });

export const optionalEmail = (val: string, ctx: z.RefinementCtx) => {
  if (val.trim() === "") return;
  const result = requiredEmailSchema.safeParse(val);
  if (!result.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: result.error.issues[0]?.message ?? "メールアドレスの形式で入力してください",
    });
  }
};

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function getDaysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

export function isValidIsoDateString(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= getDaysInMonth(year, month);
}

export function isoDateToUtcMs(value: string): number | null {
  if (!isValidIsoDateString(value)) return null;
  return dateToUtcMs(value);
}

export function getInclusiveIsoDateSpanDays(start: string, end: string): number | null {
  const startMs = isoDateToUtcMs(start);
  const endMs = isoDateToUtcMs(end);
  if (startMs === null || endMs === null) return null;
  return Math.floor((endMs - startMs) / DAY_MS) + 1;
}

export function isoDateStringSchema(
  requiredMessage = "入力してください",
  invalidMessage = "日付の形式が正しくありません",
) {
  return z.string().superRefine((value, ctx) => {
    if (value.length === 0) {
      ctx.addIssue({ code: "custom", message: requiredMessage });
      return;
    }
    if (!isValidIsoDateString(value)) {
      ctx.addIssue({ code: "custom", message: invalidMessage });
    }
  });
}

export function supportedShiftTimeSchema(
  requiredMessage = "時間を選択してください",
  invalidMessage = "時間が正しくありません",
) {
  return z.string().superRefine((value, ctx) => {
    if (value.length === 0) {
      ctx.addIssue({ code: "custom", message: requiredMessage });
      return;
    }
    if (!isSupportedShiftTime(value)) {
      ctx.addIssue({ code: "custom", message: invalidMessage });
    }
  });
}
