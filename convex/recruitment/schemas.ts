import { z } from "zod";

export const createRecruitmentSchema = z
  .object({
    periodStart: z.string().min(1, "入力してください"),
    periodEnd: z.string().min(1, "入力してください"),
    deadline: z.string().min(1, "入力してください"),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "終了日は開始日以降にしてください",
    path: ["periodEnd"],
  })
  .refine((data) => data.deadline < data.periodStart, {
    message: "締切日は開始日より前にしてください",
    path: ["deadline"],
  });

export type CreateRecruitmentInput = z.infer<typeof createRecruitmentSchema>;
