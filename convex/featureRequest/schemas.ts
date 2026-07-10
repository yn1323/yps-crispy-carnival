import { z } from "zod";
import { FEATURE_REQUEST_COMMENT_MAX_LENGTH, FEATURE_REQUEST_REQUEST_ID_MAX_LENGTH } from "../constants";

export const featureRequestCommentSchema = z
  .string()
  .trim()
  .min(1, "要望を入力してください")
  .max(FEATURE_REQUEST_COMMENT_MAX_LENGTH, `要望は${FEATURE_REQUEST_COMMENT_MAX_LENGTH}文字以内で入力してください`)
  .refine(
    (value) =>
      ![...value].some((char) => {
        const code = char.charCodeAt(0);
        return (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
      }),
    { message: "要望に使用できない文字が含まれています" },
  );

export const submitFeatureRequestSchema = z.object({
  comment: featureRequestCommentSchema,
  requestId: z
    .string()
    .max(FEATURE_REQUEST_REQUEST_ID_MAX_LENGTH, "送信情報が正しくありません")
    .uuid("送信情報が正しくありません"),
});

export type SubmitFeatureRequestInput = z.infer<typeof submitFeatureRequestSchema>;
