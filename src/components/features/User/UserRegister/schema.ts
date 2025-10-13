import { z } from "zod";
import { USER_MAX_LENGTH, USER_MIN_LENGTH } from "@/src/constants/validations";
import { betweenLength } from "@/src/helpers/validation";

export const schema = z.object({
  userName: z.string().superRefine(betweenLength(USER_MIN_LENGTH, USER_MAX_LENGTH)),
});

export type SchemaType = z.infer<typeof schema>;
