import { z } from "zod";
import { requiredEmailSchema } from "../_lib/validation";

export const createOrganizationManagerInvitationSchema = z.object({
  email: requiredEmailSchema,
  requestId: z.string().trim().min(8).max(100),
});

export const organizationInvitationRequestSchema = z.object({
  requestId: z.string().trim().min(8).max(100),
});
