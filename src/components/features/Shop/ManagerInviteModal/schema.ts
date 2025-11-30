import { z } from "zod";

export const managerInviteSchema = z.object({
  displayName: z.string().min(1).max(50),
  role: z.enum(["owner", "manager", "general"]),
});

export type ManagerInviteFormValues = z.infer<typeof managerInviteSchema>;
