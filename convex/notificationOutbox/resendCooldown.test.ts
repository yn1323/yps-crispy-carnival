import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Doc } from "../_generated/dataModel";
import { seedNotificationHistory } from "../_test/notificationHistory";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { NOTIFICATION_RESEND_COOLDOWN_MS } from "../constants";
import {
  LINE_INVITE_NOTIFICATION_KIND,
  SHIFT_CONFIRMATION_NOTIFICATION_KIND,
  SHIFT_RECRUITMENT_NOTIFICATION_KIND,
} from "./historyKinds";
import {
  collectNotificationResendCooldowns,
  deriveNotificationResendCooldowns,
  isNotificationResendCooldownActive,
} from "./resendCooldown";

type History = Pick<Doc<"notificationHistory">, "notificationKind" | "requestedAt" | "sendStatus" | "deliveryStatus">;

function history(overrides: Partial<History> = {}): History {
  return {
    notificationKind: SHIFT_RECRUITMENT_NOTIFICATION_KIND,
    requestedAt: 1_000,
    sendStatus: "queued",
    deliveryStatus: "unknown",
    ...overrides,
  };
}

describe("notificationOutbox/resendCooldown", () => {
  it.each([
    ["queued", "queued", "unknown"],
    ["sent", "sent", "unknown"],
    ["delivered", "sent", "delivered"],
    ["delayed", "sent", "delayed"],
  ] as const)("%sの履歴は送信受付から10分後まで対象にする", (_label, sendStatus, deliveryStatus) => {
    const result = deriveNotificationResendCooldowns([history({ sendStatus, deliveryStatus })]);

    expect(result.openRecruitmentsUntil).toBe(1_000 + NOTIFICATION_RESEND_COOLDOWN_MS);
  });

  it.each([
    ["send failed", "failed", "unknown"],
    ["cancelled", "cancelled", "unknown"],
    ["delivery failed", "sent", "failed"],
    ["bounced", "sent", "bounced"],
    ["suppressed", "sent", "suppressed"],
  ] as const)("%sの履歴は対象外にする", (_label, sendStatus, deliveryStatus) => {
    const result = deriveNotificationResendCooldowns([history({ sendStatus, deliveryStatus })]);

    expect(result.openRecruitmentsUntil).toBeNull();
  });

  it("通知種別ごとに最新の有効履歴からdeadlineを返す", () => {
    const result = deriveNotificationResendCooldowns([
      history({ requestedAt: 1_000 }),
      history({ requestedAt: 1_100 }),
      history({ notificationKind: SHIFT_CONFIRMATION_NOTIFICATION_KIND, requestedAt: 2_000 }),
      history({ notificationKind: LINE_INVITE_NOTIFICATION_KIND, requestedAt: 3_000 }),
    ]);

    expect(result).toEqual({
      openRecruitmentsUntil: 1_100 + NOTIFICATION_RESEND_COOLDOWN_MS,
      currentShiftUntil: 2_000 + NOTIFICATION_RESEND_COOLDOWN_MS,
      lineInviteUntil: 3_000 + NOTIFICATION_RESEND_COOLDOWN_MS,
    });
  });

  it("最新履歴が失敗でも、その直前の有効履歴のdeadlineを維持する", () => {
    const result = deriveNotificationResendCooldowns([
      history({ requestedAt: 1_000 }),
      history({ requestedAt: 2_000, sendStatus: "failed" }),
    ]);

    expect(result.openRecruitmentsUntil).toBe(1_000 + NOTIFICATION_RESEND_COOLDOWN_MS);
  });

  it("有限走査が上限に達した場合は、未走査履歴の最大deadlineまで全種別を安全側に倒す", () => {
    const conservativeUntil = 5_000 + NOTIFICATION_RESEND_COOLDOWN_MS;
    const result = deriveNotificationResendCooldowns([history({ requestedAt: 6_000 })], conservativeUntil);

    expect(result).toEqual({
      openRecruitmentsUntil: 6_000 + NOTIFICATION_RESEND_COOLDOWN_MS,
      currentShiftUntil: conservativeUntil,
      lineInviteUntil: conservativeUntil,
    });
  });

  it("最新179件では通常判定、180件到達時は最古履歴のdeadlineまでfail closedする", async () => {
    const t = convexTest(schema, modules);
    const oldestRequestedAt = 10_000;
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "resend_cooldown_saturation_manager",
        email: "resend-cooldown-saturation-manager@example.com",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "過密通知対象",
        email: "resend-cooldown-saturation@example.com",
        isDeleted: false,
      });
      for (let index = 1; index < 180; index += 1) {
        await seedNotificationHistory(ctx, {
          shopId,
          staffId,
          notificationKind: "test.noise",
          requestedAt: oldestRequestedAt + index,
        });
      }
      return { shopId, staffId };
    });

    await expect(
      t.run(
        async (ctx) => await collectNotificationResendCooldowns(ctx, [{ shopId: ids.shopId, staffId: ids.staffId }]),
      ),
    ).resolves.toEqual({
      openRecruitmentsUntil: null,
      currentShiftUntil: null,
      lineInviteUntil: null,
    });

    await t.run(
      async (ctx) =>
        await seedNotificationHistory(ctx, {
          shopId: ids.shopId,
          staffId: ids.staffId,
          notificationKind: "test.noise",
          requestedAt: oldestRequestedAt,
        }),
    );
    const saturated = await t.run(
      async (ctx) => await collectNotificationResendCooldowns(ctx, [{ shopId: ids.shopId, staffId: ids.staffId }]),
    );
    const conservativeUntil = oldestRequestedAt + NOTIFICATION_RESEND_COOLDOWN_MS;

    expect(saturated).toEqual({
      openRecruitmentsUntil: conservativeUntil,
      currentShiftUntil: conservativeUntil,
      lineInviteUntil: conservativeUntil,
    });
    expect(isNotificationResendCooldownActive(saturated.lineInviteUntil, conservativeUntil)).toBe(false);
  });

  it("10分未満だけをactiveにし、10分ちょうどで解除する", () => {
    const until = 1_000 + NOTIFICATION_RESEND_COOLDOWN_MS;

    expect(isNotificationResendCooldownActive(until, until - 1)).toBe(true);
    expect(isNotificationResendCooldownActive(until, until)).toBe(false);
    expect(isNotificationResendCooldownActive(null, until - 1)).toBe(false);
  });
});
