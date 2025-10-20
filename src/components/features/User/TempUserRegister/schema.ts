import { z } from "zod";
import { USER_MAX_LENGTH, USER_MIN_LENGTH } from "@/src/constants/validations";
import { betweenLength } from "@/src/helpers/validation";

export const schema = z.object({
  userName: z.string().superRefine(betweenLength(USER_MIN_LENGTH, USER_MAX_LENGTH)),
  email: z.string().email("正しいメールアドレスを入力してください"),
  role: z.enum(["manager", "staff"]),
});

export type SchemaType = z.infer<typeof schema>;
