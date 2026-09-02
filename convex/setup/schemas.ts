import { z } from "zod";
import { requiredDisplayTextSchema, requiredEmailSchema } from "../_lib/validation";
import { PERSON_NAME_MAX_LENGTH } from "../constants";
import { addShiftSubmissionPatternIssues, shiftSubmissionPatternSchema, shopNameSchema } from "../shop/schemas";
import { isPromotionCode, normalizePromotionCode } from "./constants";

const managerNameSchema = requiredDisplayTextSchema({ label: "名前", maxLength: PERSON_NAME_MAX_LENGTH });
const acceptedManagerLegalSchema = z.boolean().refine((value) => value, {
  message: "利用規約とプライバシーポリシーに同意してください。",
});
const optionalPromotionCodeSchema = z
  .string()
  .transform(normalizePromotionCode)
  .refine((value) => value.length === 0 || isPromotionCode(value), {
    message: "プロモーションコードは6桁の英数字で入力してください。",
  })
  .transform((value) => value || undefined)
  .optional();

const createShopBaseSchema = z.object({
  shopName: shopNameSchema,
  submissionPattern: shiftSubmissionPatternSchema,
});

export const createShopSchema = createShopBaseSchema.superRefine((data, ctx) => {
  addShiftSubmissionPatternIssues(data.submissionPattern, ctx);
});

export type CreateShopInput = z.infer<typeof createShopSchema>;

export const managerProfileSchema = z.object({
  name: managerNameSchema,
  email: requiredEmailSchema,
  promotionCode: optionalPromotionCodeSchema,
  acceptedLegal: acceptedManagerLegalSchema,
});

export type ManagerProfileInput = z.infer<typeof managerProfileSchema>;

export const setupShopAndManagerSchema = createShopBaseSchema
  .extend({
    managerName: managerNameSchema,
    managerEmail: requiredEmailSchema,
    promotionCode: optionalPromotionCodeSchema,
    acceptedLegal: acceptedManagerLegalSchema,
  })
  .superRefine((data, ctx) => {
    addShiftSubmissionPatternIssues(data.submissionPattern, ctx);
  });

export type SetupShopAndManagerInput = z.infer<typeof setupShopAndManagerSchema>;
