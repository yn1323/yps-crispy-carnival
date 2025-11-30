import { z } from "zod";

export const memberRoles = ["staff", "manager"] as const;
export type MemberRole = (typeof memberRoles)[number];

export const memberAddSchema = z.object({
  role: z.enum(memberRoles),
  displayName: z.string().min(1).max(50),
  email: z.string().min(1).email().max(255),
});

export type MemberAddFormValues = z.infer<typeof memberAddSchema>;
