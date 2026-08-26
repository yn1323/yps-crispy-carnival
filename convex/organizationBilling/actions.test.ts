import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("organizationBilling/actions", () => {
  it("課金通知を管理者ごとのemailだけでOutboxへ積み、同じeventKeyを重複させない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "billing_notice", plan: "business" }));

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "planActivated",
        eventKey: "plan-activated-1",
        notificationDetails: {
          targetPlan: "business",
          amountDue: 1_200,
          currency: "jpy",
          effectiveAt: Date.parse("2026-09-01T00:00:00+09:00"),
        },
      }),
    ).resolves.toEqual({ enqueuedCount: 1 });
    await t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
      organizationId: ids.organizationId,
      event: "planActivated",
      eventKey: "plan-activated-1",
      notificationDetails: {
        targetPlan: "business",
        amountDue: 9_999,
        currency: "jpy",
        effectiveAt: Date.parse("2026-09-01T00:00:00+09:00"),
      },
    });

    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      organizationId: ids.organizationId,
      userId: ids.userId,
      channel: "email",
      purpose: "billing",
      status: "pending",
      dedupeKey: `email:organizationBilling:plan-activated-1:${ids.userId}`,
      payload: { kind: "email", context: "organizationBilling.planActivated" },
    });
    expect(jobs[0]?.payload.kind === "email" ? jobs[0].payload.subject : "").toContain("Proを開始しました");
    expect(jobs[0]?.payload.kind === "email" ? jobs[0].payload.html : "").toContain("1,200");
    expect(jobs[0]?.payload.kind === "email" ? jobs[0].payload.html : "").not.toContain("9,999");
    if (jobs[0]?.payload.kind !== "email") throw new Error("email payload not found");
    const actionUrl = extractBillingSettingsActionUrl(jobs[0].payload.html);
    expect(actionUrl.pathname).toBe("/manage/billing");
    expect([...actionUrl.searchParams.entries()]).toEqual([["org", ids.organizationId]]);
    expect(jobs.some((job) => job.channel === "line")).toBe(false);
  });

  it("支払い不要Pro相当では内部通知actionを直接呼んでも課金通知を作成しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "complimentary_billing_notice",
        complimentary: true,
      }),
    );

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "billingEmailChanged",
        eventKey: "complimentary-billing-notice",
      }),
    ).resolves.toEqual({ enqueuedCount: 0 });
    await expect(t.run((ctx) => ctx.db.query("notificationOutbox").collect())).resolves.toEqual([]);
  });

  it("Free適用通知は指定された有効管理者snapshotへ送れるが、削除済み人物は除外する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "free_notice", plan: "free" }));

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "freeApplied",
        eventKey: "free-applied-1",
        recipientUserIds: [ids.userId],
      }),
    ).resolves.toEqual({ enqueuedCount: 1 });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.personId, { status: "removed", updatedAt: Date.now() });
    });
    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "freeApplied",
        eventKey: "free-applied-removed",
        recipientUserIds: [ids.userId],
      }),
    ).resolves.toEqual({ enqueuedCount: 0 });
  });

  it("古いTrial期限のreminderは新しい状態へ送らない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "stale_trial_notice", plan: "pro" }));

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "trialEnding",
        eventKey: "stale-trial",
        expectedDeadlineAt: Date.now() + 1000,
      }),
    ).resolves.toEqual({ enqueuedCount: 0 });
    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(0);
  });

  it("Trial終了通知は選択済みプランと終了時刻をDTOから本文へ反映する", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = Date.parse("2026-09-01T00:00:00+09:00");
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_notice", plan: "business" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt, selectedPaidPlan: "business" },
      });
      return seeded;
    });

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "trialEnding",
        eventKey: "trial-ending-selected-business",
        expectedDeadlineAt: trialEndsAt,
      }),
    ).resolves.toEqual({ enqueuedCount: 1 });

    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.payload.kind).toBe("email");
    if (jobs[0]?.payload.kind !== "email") throw new Error("email payload not found");
    expect(jobs[0].payload.html).toContain("選択済みの契約プランはProです。");
    expect(jobs[0].payload.html).toContain("初回請求は9/1(火) 00:00を予定しています。");
    expect(jobs[0].payload.html).toContain("継続を取り消す場合の期限は9/1(火) 00:00です。");
    expect(jobs[0].payload.html).toContain("取り消すと、トライアル終了後は無料プランへ変更されます。");
    expect(jobs[0].payload.html).toContain("無料プランの利用上限を超えている場合は");
    expect(jobs[0].payload.html).not.toContain("円");
  });
});

function extractBillingSettingsActionUrl(html: string) {
  const href = html.match(/<a href="([^"]+)"[^>]*>組織設定を確認する<\/a>/)?.[1];
  if (!href) throw new Error("billing settings action URL not found");
  return new URL(href);
}
