import { z } from "zod";
import { SKILL_LEVELS, STAFF_MAX_WEEKLY_HOURS_MAX, STAFF_MAX_WEEKLY_HOURS_MIN } from "@/src/constants/validations";

export const staffEditSchema = z.object({
  email: z.string().min(1).email(),
  displayName: z.string().min(1).max(50),
  skills: z.array(
    z.object({
      position: z.string().min(1),
      level: z.enum(SKILL_LEVELS),
    }),
  ),
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
