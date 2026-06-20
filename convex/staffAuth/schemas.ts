import { z } from "zod";
import { requiredEmailSchema } from "../_lib/validation";

export const reissueSchema = z.object({
  email: requiredEmailSchema,
});

export type ReissueFormValues = z.infer<typeof reissueSchema>;
