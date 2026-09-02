import { z } from "zod";
import { requiredDisplayTextSchema, requiredEmailSchema } from "../_lib/validation";
import { PERSON_NAME_MAX_LENGTH } from "../constants";

export const createExternalOrganizationManagerInvitationSchema = z.object({
  name: requiredDisplayTextSchema({ label: "名前", maxLength: PERSON_NAME_MAX_LENGTH }),
  email: requiredEmailSchema,
  requestId: z.string().trim().min(8).max(100),
});

export const organizationInvitationRequestSchema = z.object({
  requestId: z.string().trim().min(8).max(100),
});
