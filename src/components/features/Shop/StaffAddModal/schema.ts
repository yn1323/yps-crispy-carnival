import { z } from "zod";

export const staffAddSchema = z.object({
  email: z.string().min(1).email(),
  displayName: z.string().min(1).max(50),
});

export type StaffAddFormValues = z.infer<typeof staffAddSchema>;
