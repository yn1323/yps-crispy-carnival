import { z } from "zod";
import { SKILL_LEVELS, type SkillLevelType } from "@/src/constants/validations";

// スキルレベルのスキーマ
const skillLevelSchema = z.enum(SKILL_LEVELS);

// スタッフ編集スキーマ（スキルはRecord形式で動的に管理）
export const staffEditSchema = z.object({
  email: z.string().min(1).email(),
  displayName: z.string().min(1).max(50),
  skills: z.record(z.string(), skillLevelSchema),
  memo: z.string().max(500).optional(),
  workStyleNote: z.string().max(500).optional(),
});

// 型推論
export type StaffEditFormValues = z.infer<typeof staffEditSchema>;

// スキル値の型
export type SkillsFormValues = Record<string, SkillLevelType>;
