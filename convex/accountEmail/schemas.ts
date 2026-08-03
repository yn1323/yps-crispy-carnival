import { z } from "zod";
import { requiredEmailSchema } from "../_lib/validation";

export const accountEmailPreflightSchema = z.object({
  email: requiredEmailSchema,
});

export const accountEmailRequestSchema = z.object({
  requestId: z.string().trim().min(8).max(100),
});
