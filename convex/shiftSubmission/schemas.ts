import { z } from "zod";
import { isoDateStringSchema, supportedShiftTimeSchema } from "../_lib/validation";
import { SHIFT_DATE_NOTE_MAX_LENGTH, SHIFT_REQUESTS_PER_SUBMISSION_LIMIT } from "../constants";

// 正規化前の上限。巨大な入力に正規表現を走らせない。
const SHIFT_DATE_NOTE_RAW_MAX_LENGTH = 1_000;
const SHIFT_DATE_NOTE_SPACE_PATTERN = /[\t\n\r]/g;
// 制御文字と、表示順を入れ替えられる双方向制御文字。
const SHIFT_DATE_NOTE_REMOVED_PATTERN = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/** 日付メモを1行の表示用テキストへ正規化する。空文字はメモなしを表す。 */
export const normalizeShiftDateNote = (note: string) =>
  note.replace(SHIFT_DATE_NOTE_SPACE_PATTERN, " ").replace(SHIFT_DATE_NOTE_REMOVED_PATTERN, "").trim();

const shiftRequestDateSchema = isoDateStringSchema("日付を入力してください", "日付の形式が正しくありません");
const shiftRequestStartTimeSchema = supportedShiftTimeSchema(
  "開始時間を入力してください",
  "開始時間が正しくありません",
);
const shiftRequestEndTimeSchema = supportedShiftTimeSchema("終了時間を入力してください", "終了時間が正しくありません");

export const shiftRequestSchema = z.object({
  date: shiftRequestDateSchema,
  startTime: shiftRequestStartTimeSchema,
  endTime: shiftRequestEndTimeSchema,
});

export const shiftDateNoteTextSchema = z
  .string()
  .max(SHIFT_DATE_NOTE_RAW_MAX_LENGTH, `メモは${SHIFT_DATE_NOTE_MAX_LENGTH}文字以内で入力してください`)
  .transform(normalizeShiftDateNote)
  .pipe(z.string().max(SHIFT_DATE_NOTE_MAX_LENGTH, `メモは${SHIFT_DATE_NOTE_MAX_LENGTH}文字以内で入力してください`));

/** 提出する日付メモ。空のメモは保存せず、その日のメモを削除したものとして扱う。 */
export const shiftDateNotesSchema = z
  .array(z.object({ date: shiftRequestDateSchema, note: shiftDateNoteTextSchema }))
  .max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT)
  .transform((notes) => notes.filter((entry) => entry.note.length > 0));

export const submitShiftRequestsSchema = z.object({
  requests: z.array(shiftRequestSchema).max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
});

export const submitShiftSelectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("time"),
    requests: z.array(shiftRequestSchema).max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
  }),
  z.object({
    kind: z.literal("dateOnly"),
    workingDates: z.array(shiftRequestDateSchema).max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
  }),
  z.object({
    kind: z.literal("shiftType"),
    selections: z
      .array(
        z.object({
          date: shiftRequestDateSchema,
          optionId: z.string().min(1),
        }),
      )
      .max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
  }),
]);

export type SubmitShiftSelection = z.infer<typeof submitShiftSelectionSchema>;
