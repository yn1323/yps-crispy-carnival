import { z } from "zod";
import { USER_MAX_LENGTH, USER_MIN_LENGTH } from "@/src/constants/validations";
import { betweenLength } from "@/src/helpers/validation";

export const roleOptions = [
  { value: "general", label: "スタッフ" },
  { value: "manager", label: "マネージャー" },
  { value: "owner", label: "オーナー" },
];

export const schema = z.object({
  displayName: z.string().superRefine(betweenLength(USER_MIN_LENGTH, USER_MAX_LENGTH)),
  email: z.string().email(),
  role: z.string().min(1),
});

export type SchemaType = z.infer<typeof schema>;
