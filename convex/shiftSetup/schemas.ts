import { z } from "zod";
import { requiredDisplayTextSchema } from "../_lib/validation";
import {
  POSITION_ACTIVE_LIMIT,
  POSITION_COLOR_PALETTE,
  POSITION_NAME_MAX_LENGTH,
  SHIFT_BREAK_RULE_MAX_MINUTES,
  SHIFT_SETUP_ASSIST_SITUATION_MAX_LENGTH,
} from "../constants";

// 「シフト作成の設定」の入力をフロントエンドと共有するschema。
// DBアクセス・Convex APIのインポート禁止。

export const positionNameSchema = requiredDisplayTextSchema({
  label: "ポジション名",
  maxLength: POSITION_NAME_MAX_LENGTH,
});

export const positionColorSchema = z
  .string()
  .refine((value) => (POSITION_COLOR_PALETTE as readonly string[]).includes(value), {
    message: "色は一覧から選んでください",
  });

export const savePositionsSchema = z
  .object({
    positions: z
      .array(z.object({ id: z.string().optional(), name: positionNameSchema, color: positionColorSchema }))
      .min(1, "ポジションを1つ以上登録してください")
      .max(POSITION_ACTIVE_LIMIT, `ポジションは${POSITION_ACTIVE_LIMIT}件まで登録できます`),
  })
  .superRefine((data, ctx) => {
    const names = new Set<string>();
    data.positions.forEach((position, index) => {
      if (names.has(position.name)) {
        ctx.addIssue({ code: "custom", message: "ポジション名が重複しています", path: ["positions", index, "name"] });
      }
      names.add(position.name);
    });
  });

/** 休憩の決まり。画面は勤務の長さを30分単位、休憩の長さを15分単位で選ばせる。 */
export const BREAK_RULE_WORK_UNIT_MINUTES = 30;
export const BREAK_RULE_BREAK_UNIT_MINUTES = 15;

export const breakRuleSchema = z
  .object({
    minWorkMinutes: z
      .number()
      .int()
      .min(BREAK_RULE_WORK_UNIT_MINUTES, "勤務の長さを選んでください")
      .max(SHIFT_BREAK_RULE_MAX_MINUTES, "勤務の長さが正しくありません")
      .refine((value) => value % BREAK_RULE_WORK_UNIT_MINUTES === 0, { message: "勤務の長さが正しくありません" }),
    breakMinutes: z
      .number()
      .int()
      .min(BREAK_RULE_BREAK_UNIT_MINUTES, "休憩の長さを選んでください")
      .max(SHIFT_BREAK_RULE_MAX_MINUTES, "休憩の長さが正しくありません")
      .refine((value) => value % BREAK_RULE_BREAK_UNIT_MINUTES === 0, { message: "休憩の長さが正しくありません" }),
  })
  .refine((rule) => rule.breakMinutes < rule.minWorkMinutes, {
    message: "休憩は勤務より短くしてください",
    path: ["breakMinutes"],
  });

export const assistSituationSchema = z
  .string()
  .trim()
  .min(1, "店の状況を入力してください")
  .max(SHIFT_SETUP_ASSIST_SITUATION_MAX_LENGTH, `${SHIFT_SETUP_ASSIST_SITUATION_MAX_LENGTH}文字以内で入力してください`);

export type SavePositionsInput = z.infer<typeof savePositionsSchema>;
export type BreakRuleInput = z.infer<typeof breakRuleSchema>;
