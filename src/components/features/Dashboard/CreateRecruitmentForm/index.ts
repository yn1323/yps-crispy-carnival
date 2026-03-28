import { z } from "zod";

export const createRecruitmentSchema = z
  .object({
    periodStart: z.string().min(1, "必須項目です"),
    periodEnd: z.string().min(1, "必須項目です"),
    deadline: z.string().min(1, "必須項目です"),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "終了日は開始日以降にしてください",
    path: ["periodEnd"],
  })
  .refine((data) => data.deadline < data.periodStart, {
    message: "締切日は開始日より前にしてください",
    path: ["deadline"],
  });

export type CreateRecruitmentData = z.infer<typeof createRecruitmentSchema>;
