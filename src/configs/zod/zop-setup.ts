import type { z } from "zod";

export const customErrorMap: z.ZodErrorMap = (issue) => {
  if (issue.code === "invalid_format") {
    return { message: "メールアドレスの形式で入力してください" };
  }

  switch (issue.code) {
    case "too_small":
      if (issue.type === "array") {
        return { message: `${issue.minimum}つ以上選択してください。` };
      }
      if (issue.minimum === 1) {
        return { message: "必須項目です" };
      } else {
        return { message: `${issue.minimum}文字以上で入力してください` };
      }

    case "too_big":
      return { message: `${issue.maximum}文字以内で入力してください` };
  }

  return { message: "入力値が正しくありません" };
};
