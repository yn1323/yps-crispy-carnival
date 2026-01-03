import { z } from "zod";
import { SKILL_LEVELS, STAFF_MAX_WEEKLY_HOURS_MAX, STAFF_MAX_WEEKLY_HOURS_MIN } from "@/src/constants/validations";

// スキルレベルのスキーマ
const skillLevelSchema = z.enum(SKILL_LEVELS);

// スキルをオブジェクト形式で管理（全ポジション必須）
const skillsSchema = z.object({
  ホール: skillLevelSchema,
  キッチン: skillLevelSchema,
  レジ: skillLevelSchema,
  その他: skillLevelSchema,
});

export const staffEditSchema = z.object({
  email: z.string().min(1).email(),
  displayName: z.string().min(1).max(50),
  skills: skillsSchema,
  maxWeeklyHours: z.union([
    z.number().min(STAFF_MAX_WEEKLY_HOURS_MIN).max(STAFF_MAX_WEEKLY_HOURS_MAX),
    z.literal(""),
    z.null(),
  ]),
  memo: z.string().max(500).optional(),
  workStyleNote: z.string().max(500).optional(),
  hourlyWage: z.union([z.number().min(0).max(100000), z.literal(""), z.null()]),
});

export type StaffEditFormValues = z.infer<typeof staffEditSchema>;

// スキルのオブジェクト形式の型
export type SkillsFormValues = z.infer<typeof skillsSchema>;
