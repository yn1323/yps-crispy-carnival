import { z } from "zod";
import { USER_MAX_LENGTH, USER_MIN_LENGTH } from "@/src/constants/validations";
import { betweenLength } from "@/src/helpers/validation";

export const schema = z.object({
  userName: z.string().superRefine(betweenLength(USER_MIN_LENGTH, USER_MAX_LENGTH)),
  maxWorkingHoursPerMonth: z.union([z.number().min(1).max(744), z.nan()]).optional(),
  hourlyWage: z.union([z.number().min(1).max(100000), z.nan()]).optional(),
  memo: z.string().max(1000).optional(),
  workStyleNote: z.string().max(1000).optional(),
});

export type SchemaType = z.infer<typeof schema>;
