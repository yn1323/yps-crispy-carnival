import zod from "zod";

export const customErrorMap: zod.ZodErrorMap = (issue, ctx) => {
  if (issue.code === zod.ZodIssueCode.invalid_string) {
    if (issue.validation === "email") {
      return { message: "メールアドレスの形式で入力してください" };
    }
  }

  switch (issue.code) {
    case zod.ZodIssueCode.too_small:
      if (issue.type === "array") {
        return { message: `${issue.minimum}つ以上選択してください。` };
      }
      if (issue.minimum === 1) {
        return { message: "必須項目です" };
      } else {
        return { message: `${issue.minimum}文字以上で入力してください` };
      }

    case zod.ZodIssueCode.too_big:
      return { message: `${issue.maximum}文字以内で入力してください` };
  }

  return { message: ctx.defaultError };
};
