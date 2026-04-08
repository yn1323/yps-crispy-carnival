import dayjs from "dayjs";
import { createRecruitmentSchema } from "@/convex/recruitment/schemas";

export {
  type CreateRecruitmentInput as CreateRecruitmentData,
  createRecruitmentSchema,
} from "@/convex/recruitment/schemas";

const today = dayjs().format("YYYY-MM-DD");

export const createRecruitmentFormSchema = createRecruitmentSchema
  .refine((data) => data.deadline >= today, {
    message: "締切日は今日以降にしてください",
    path: ["deadline"],
  })
  .refine((data) => data.periodStart > today, {
    message: "開始日は明日以降にしてください",
    path: ["periodStart"],
  });
