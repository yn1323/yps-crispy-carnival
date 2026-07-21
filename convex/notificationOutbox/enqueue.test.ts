import { describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { emailPayload, enqueueEmail, organizationManagerInvitationEmailPayload } from "./enqueue";
import { NOTIFICATION_FAILURE_REMINDER_CONTEXT } from "./failureSuppress";

describe("notificationOutbox/enqueue", () => {
  it("管理者招待payloadをemail channelとして参照情報だけでenqueueする", async () => {
    const organizationId = "organization_test" as Id<"organizations">;
    const invitationId = "invitation_test" as Id<"organizationInvitations">;
    const runMutation = vi.fn().mockResolvedValue({ outboxId: "outbox_test", deduped: false });
    const payload = organizationManagerInvitationEmailPayload({
      from: "シフトリ <noreply@example.com>",
      to: "invite@example.com",
      context: "organizationInvitation.send",
    });

    await enqueueEmail({ runMutation } as unknown as Parameters<typeof enqueueEmail>[0], {
      organizationId,
      organizationBillingVersionAtOrigin: 3,
      organizationInvitationId: invitationId,
      organizationInvitationVersion: 2,
      purpose: "business",
      dedupeKey: "email:organizationInvitation:invitation_test:2",
      payload,
    });

    expect(runMutation).toHaveBeenCalledOnce();
    expect(runMutation).toHaveBeenCalledWith(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      organizationId,
      organizationBillingVersionAtOrigin: 3,
      organizationInvitationId: invitationId,
      organizationInvitationVersion: 2,
      purpose: "business",
      dedupeKey: "email:organizationInvitation:invitation_test:2",
      payload,
    });
    expect(payload).not.toHaveProperty("html");
    expect(payload).not.toHaveProperty("subject");
  });

  it("管理者招待のenqueue失敗イベントへ事業者と招待の参照だけを残す", async () => {
    const organizationId = "organization_test" as Id<"organizations">;
    const invitationId = "invitation_test" as Id<"organizationInvitations">;
    const runMutation = vi.fn().mockRejectedValueOnce(new Error("enqueue failed")).mockResolvedValueOnce(null);

    await expect(
      enqueueEmail({ runMutation } as unknown as Parameters<typeof enqueueEmail>[0], {
        organizationId,
        organizationBillingVersionAtOrigin: 4,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 2,
        purpose: "business",
        dedupeKey: "email:organizationInvitation:invitation_test:2",
        payload: organizationManagerInvitationEmailPayload({
          from: "シフトリ <noreply@example.com>",
          to: "invite@example.com",
          context: "organizationInvitation.send",
        }),
      }),
    ).resolves.toBeNull();

    expect(runMutation).toHaveBeenNthCalledWith(2, internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_failed",
      organizationId,
      organizationInvitationId: invitationId,
      organizationInvitationVersion: 2,
      channel: "email",
      dedupeKey: "email:organizationInvitation:invitation_test:2",
      notificationContext: "organizationInvitation.send",
      errorMessage: "notification_enqueue_failed",
    });
  });

  it("suppressFailureInboxつきpayloadでもenqueue失敗イベントを記録する", async () => {
    const shopId = "shop_test" as Id<"shops">;
    const userId = "user_test" as Id<"users">;
    const dedupeKey = "email:notificationFailureReminder:shop_test:user_test";
    const runMutation = vi.fn().mockRejectedValueOnce(new Error("enqueue failed")).mockResolvedValueOnce(null);

    const result = await enqueueEmail({ runMutation } as unknown as Parameters<typeof enqueueEmail>[0], {
      shopId,
      userId,
      dedupeKey,
      payload: emailPayload({
        from: "シフトリ <noreply@example.com>",
        to: "manager@example.com",
        subject: "通知エラーがあります",
        html: "<p>test</p>",
        context: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
        suppressDelivery: true,
        suppressFailureInbox: true,
      }),
    });

    expect(result).toBeNull();
    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(runMutation).toHaveBeenNthCalledWith(2, internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_failed",
      shopId,
      userId,
      channel: "email",
      dedupeKey,
      notificationContext: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
      errorMessage: "notification_enqueue_failed",
    });
  });
});
