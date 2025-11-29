import { z } from "zod";
import { STAFF_EMAIL_MAX_LENGTH, USER_MAX_LENGTH, USER_MIN_LENGTH } from "@/src/constants/validations";
import { betweenLength } from "@/src/helpers/validation";

export const schema = z.object({
  userName: z.string().superRefine(betweenLength(USER_MIN_LENGTH, USER_MAX_LENGTH)),
  email: z.string().min(1).max(STAFF_EMAIL_MAX_LENGTH).email(),
});

export type SchemaType = z.infer<typeof schema>;
