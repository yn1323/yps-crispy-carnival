import { z } from "zod";

export const recruitmentFormSchema = z
  .object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    deadline: z.string().min(1),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "終了日は開始日以降を指定してください",
    path: ["endDate"],
  })
  .refine((data) => data.deadline < data.startDate, {
    message: "締切日は開始日より前を指定してください",
    path: ["deadline"],
  });

export type RecruitmentFormSchemaType = z.infer<typeof recruitmentFormSchema>;
