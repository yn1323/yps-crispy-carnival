import { z } from "zod";
import { requiredDisplayTextSchema, requiredEmailSchema } from "../_lib/validation";
import { PERSON_NAME_MAX_LENGTH } from "../constants";

export const staffRegistrationFormSchema = z.object({
  name: requiredDisplayTextSchema({ label: "名前", maxLength: PERSON_NAME_MAX_LENGTH }),
  email: requiredEmailSchema,
  acceptedLegal: z.boolean().refine((value) => value === true, {
    message: "利用規約とプライバシーポリシーに同意してください",
  }),
});

export type StaffRegistrationFormData = z.infer<typeof staffRegistrationFormSchema>;
