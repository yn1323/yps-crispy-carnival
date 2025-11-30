import { z } from "zod";

export const managerInviteSchema = z.object({
  displayName: z.string().min(1).max(50),
});

export type ManagerInviteFormValues = z.infer<typeof managerInviteSchema>;
