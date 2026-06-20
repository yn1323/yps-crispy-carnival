import { z } from "zod";
import { requiredDisplayTextSchema, requiredEmailSchema } from "../_lib/validation";
import { PERSON_NAME_MAX_LENGTH } from "../constants";
import { addShiftSubmissionPatternIssues, shiftSubmissionPatternSchema, shopNameSchema } from "../shop/schemas";

const managerNameSchema = requiredDisplayTextSchema({ label: "名前", maxLength: PERSON_NAME_MAX_LENGTH });
const acceptedManagerLegalSchema = z.boolean().refine((value) => value, {
  message: "利用規約とプライバシーポリシーに同意してください",
});

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
  acceptedLegal: acceptedManagerLegalSchema,
});

export type ManagerProfileInput = z.infer<typeof managerProfileSchema>;

export const setupShopAndManagerSchema = createShopBaseSchema
  .extend({
    managerName: managerNameSchema,
    managerEmail: requiredEmailSchema,
    acceptedLegal: acceptedManagerLegalSchema,
  })
  .superRefine((data, ctx) => {
    addShiftSubmissionPatternIssues(data.submissionPattern, ctx);
  });

export type SetupShopAndManagerInput = z.infer<typeof setupShopAndManagerSchema>;
