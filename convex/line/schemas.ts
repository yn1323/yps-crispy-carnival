import { z } from "zod";

export const generateLinkTokenSchema = z.object({
  staffId: z.string().min(1),
});
export type GenerateLinkTokenInput = z.infer<typeof generateLinkTokenSchema>;

export const redeemLineTokenSchema = z.object({
  state: z.string().min(1),
  code: z.string().min(1),
});
export type RedeemLineTokenInput = z.infer<typeof redeemLineTokenSchema>;

export const sendLineInviteSchema = z.object({
  staffId: z.string().min(1),
});
export type SendLineInviteInput = z.infer<typeof sendLineInviteSchema>;
