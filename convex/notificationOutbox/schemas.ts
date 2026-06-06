import { v } from "convex/values";

export const notificationChannelValidator = v.union(v.literal("email"), v.literal("line"));

export const notificationOutboxStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("sent"),
  v.literal("failed"),
);

export const notificationEmailPayloadValidator = v.object({
  kind: v.literal("email"),
  from: v.string(),
  to: v.string(),
  subject: v.string(),
  html: v.string(),
  context: v.string(),
  suppressDelivery: v.optional(v.boolean()),
});

export const notificationLinePayloadValidator = v.object({
  kind: v.literal("line"),
  toUserId: v.string(),
  text: v.string(),
  suppressDelivery: v.optional(v.boolean()),
  fallbackEmail: v.optional(
    v.object({
      dedupeKey: v.string(),
      payload: notificationEmailPayloadValidator,
    }),
  ),
});

export const notificationPayloadValidator = v.union(
  notificationEmailPayloadValidator,
  notificationLinePayloadValidator,
);
