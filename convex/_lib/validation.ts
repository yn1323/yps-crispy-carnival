import { z } from "zod";

const emailSchema = z.string().email();

export const optionalEmail = (val: string, ctx: z.RefinementCtx) => {
  if (val !== "" && !emailSchema.safeParse(val).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "正しいメールアドレスを入力してください",
    });
  }
};
