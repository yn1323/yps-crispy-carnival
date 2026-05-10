import dayjs from "dayjs";
import { createRecruitmentSchema } from "@/convex/recruitment/schemas";

export {
  type CreateRecruitmentInput as CreateRecruitmentData,
  createRecruitmentSchema,
} from "@/convex/recruitment/schemas";

export const createRecruitmentFormSchema = createRecruitmentSchema
  .refine((data) => data.deadline >= dayjs().format("YYYY-MM-DD"), {
    message: "締切日は今日以降にしてください",
    path: ["deadline"],
  })
  .refine((data) => data.periodStart > dayjs().format("YYYY-MM-DD"), {
    message: "開始日は明日以降にしてください",
    path: ["periodStart"],
  });
