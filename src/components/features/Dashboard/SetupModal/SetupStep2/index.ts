import { z } from "zod";

export const step2Schema = z
  .object({
    periodStart: z.string().min(1),
    periodEnd: z.string().min(1),
    deadline: z.string().min(1),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "終了日は開始日以降にしてください",
    path: ["periodEnd"],
  })
  .refine((data) => data.deadline < data.periodStart, {
    message: "締切日は開始日より前にしてください",
    path: ["deadline"],
  });

export type Step2Data = z.infer<typeof step2Schema>;
