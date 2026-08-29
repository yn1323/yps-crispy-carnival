import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { createConvexTestWithMigrations } from "../_test/migrations.test-helper";
import { seedCanonicalStaffLineRecipient, seedOrganizationManagerShop } from "../_test/seed";
import { NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS } from "../constants";
import {
  NOTIFICATION_FAILURE_REMINDER_CONTEXT,
  SHIFT_CONFIRMATION_REMINDER_CONTEXT,
  SHOP_ACTIVATION_REMINDER_CONTEXT,
  STAFF_REGISTRATION_OWNER_DIGEST_CONTEXT,
} from "./shopManagerNotification";

describe("店舗管理通知の配送直前検証", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    STAFF_REGISTRATION_OWNER_DIGEST_CONTEXT,
    SHIFT_CONFIRMATION_REMINDER_CONTEXT,
    SHOP_ACTIVATION_REMINDER_CONTEXT,
    NOTIFICATION_FAILURE_REMINDER_CONTEXT,
  ])("店舗staffから外れた管理者へ%sのメールを送信しない", async (context) => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: `shop_manager_email_${context}`,
        email: "shop-manager-email@example.com",
        plan: "standard",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.personId,
        userId: seeded.userId,
        name: "店舗通知管理者",
        email: "shop-manager-email@example.com",
        emailNormalized: "shop-manager-email@example.com",
        isDeleted: false,
      });
      return { ...seeded, staffId };
    });
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      userId: ids.userId,
      purpose: "business",
      dedupeKey: `email:shop-manager-membership:${context}`,
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "shop-manager-email@example.com",
        subject: "店舗通知",
        html: "<p>test</p>",
        context,
        suppressDelivery: true,
      },
    });
    if (!enqueued) throw new Error("shop manager email was not enqueued");
    await t.run(async (ctx) => await ctx.db.patch(ids.staffId, { isDeleted: true }));
    vi.advanceTimersByTime(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const [claimed] = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    if (!claimed?.leaseToken) throw new Error("shop manager email lease was not issued");

    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: enqueued.outboxId,
        leaseToken: claimed.leaseToken,
        now: Date.now(),
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(enqueued.outboxId))).resolves.toMatchObject({
      status: "cancelled",
      cancelReason: "recipient_inactive",
    });
  });

  it("LINEとfallbackメールの両方で店舗staff所属を再検証する", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "shop_manager_line_membership",
        email: "shop-manager-line@example.com",
        plan: "standard",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.personId,
        userId: seeded.userId,
        name: "LINE店舗通知管理者",
        email: "shop-manager-line@example.com",
        emailNormalized: "shop-manager-line@example.com",
        isDeleted: false,
      });
      const recipient = await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_shop_manager_membership",
        following: true,
      });
      return { ...seeded, staffId, recipient };
    });
    const fallbackPayload = {
      kind: "email" as const,
      from: "シフトリ <noreply@example.com>",
      to: "shop-manager-line@example.com",
      subject: "店舗通知",
      html: "<p>test</p>",
      context: SHIFT_CONFIRMATION_REMINDER_CONTEXT,
      suppressDelivery: true,
    };
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      userId: ids.userId,
      organizationPersonLineLinkId: ids.recipient.organizationPersonLineLinkId,
      organizationPersonLineGenerationAtEnqueue: ids.recipient.generation,
      purpose: "business",
      dedupeKey: "line:shop-manager-membership:line",
      payload: {
        kind: "line",
        toUserId: "U_shop_manager_membership",
        text: "店舗通知",
        suppressDelivery: true,
        fallbackEmail: {
          dedupeKey: "email:shop-manager-membership:fallback",
          payload: fallbackPayload,
        },
      },
    });
    if (!enqueued) throw new Error("shop manager LINE notification was not enqueued");
    await t.run(async (ctx) => await ctx.db.patch(ids.staffId, { isDeleted: true }));

    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        userId: ids.userId,
        purpose: "business",
        dedupeKey: "email:shop-manager-membership:fallback",
        payload: fallbackPayload,
      }),
    ).resolves.toBeNull();

    vi.advanceTimersByTime(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const [claimed] = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    if (!claimed?.leaseToken) throw new Error("shop manager LINE lease was not issued");
    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareLineForProviderDelivery, {
        outboxId: enqueued.outboxId,
        leaseToken: claimed.leaseToken,
        now: Date.now(),
      }),
    ).resolves.toBeNull();
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(jobs).toEqual([
      expect.objectContaining({
        _id: enqueued.outboxId,
        status: "cancelled",
        cancelReason: "recipient_inactive",
      }),
    ]);
  });

  it("組織・課金メールは店舗staff所属を必須にしない", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "organization_mail_without_shop_staff",
          email: "organization-mail@example.com",
          plan: "standard",
        }),
    );
    const commonPayload = {
      kind: "email" as const,
      from: "シフトリ <noreply@example.com>",
      to: "organization-mail@example.com",
      subject: "組織のお知らせ",
      html: "<p>test</p>",
      suppressDelivery: true,
    };

    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        userId: ids.userId,
        purpose: "business",
        dedupeKey: "email:organization:without-shop-staff",
        payload: { ...commonPayload, context: "organization.generalNotice" },
      }),
    ).resolves.toEqual({ outboxId: expect.any(String), deduped: false });
    await expect(
      t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        organizationId: ids.organizationId,
        userId: ids.userId,
        purpose: "billing",
        dedupeKey: "email:billing:without-shop-staff",
        payload: { ...commonPayload, context: "organizationBilling.billingEmailChanged" },
      }),
    ).resolves.toEqual({ outboxId: expect.any(String), deduped: false });
  });
});
