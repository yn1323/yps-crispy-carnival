import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function addManager(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  subject: string,
  status: { member?: "active" | "removed"; person?: "active" | "removed"; userDeleted?: boolean } = {},
) {
  const userId = await seedUser(ctx, subject);
  const now = Date.now();
  const email = `${subject}-current@example.com`;
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId,
    name: `管理者 ${subject}`,
    email,
    emailNormalized: email,
    status: status.person ?? "active",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("organizationMembers", {
    organizationId,
    personId,
    userId,
    status: status.member ?? "active",
    createdAt: now,
    updatedAt: now,
  });
  if (status.userDeleted) await ctx.db.patch(userId, { isDeleted: true });
  return { userId, email };
}

describe("organizationBilling/actions", () => {
  it("請求先変更を全有効管理者の現在のemailへ個別送信し、無効な管理者とLINEを除外して重複させない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "billing_email_changed",
        plan: "business",
      });
      const ownerEmail = "billing-owner-current@example.com";
      await ctx.db.patch(seeded.personId, {
        email: ownerEmail,
        emailNormalized: ownerEmail,
        updatedAt: Date.now(),
      });
      const activeManager = await addManager(ctx, seeded.organizationId, "billing_active_manager");
      await addManager(ctx, seeded.organizationId, "billing_removed_member", { member: "removed" });
      await addManager(ctx, seeded.organizationId, "billing_removed_person", { person: "removed" });
      await addManager(ctx, seeded.organizationId, "billing_deleted_user", { userDeleted: true });
      return { ...seeded, ownerEmail, activeManager };
    });

    await t.action(internal.organizationBilling.actions.enqueueBillingEmailChangedNotification, {
      organizationId: ids.organizationId,
      eventKey: "billing-email-changed-1",
    });
    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingEmailChangedNotification, {
        organizationId: ids.organizationId,
        eventKey: "billing-email-changed-1",
      }),
    ).resolves.toEqual({ enqueuedCount: 2 });

    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.userId).sort()).toEqual([ids.userId, ids.activeManager.userId].sort());
    expect(jobs.map((job) => (job.payload.kind === "email" ? job.payload.to : "")).sort()).toEqual(
      [ids.ownerEmail, ids.activeManager.email].sort(),
    );
    expect(jobs.map((job) => job.dedupeKey).sort()).toEqual(
      [
        `email:organizationBilling:billing-email-changed-1:${ids.userId}`,
        `email:organizationBilling:billing-email-changed-1:${ids.activeManager.userId}`,
      ].sort(),
    );
    expect(
      jobs.every(
        (job) =>
          job.channel === "email" &&
          job.purpose === "billing" &&
          job.status === "pending" &&
          job.payload.kind === "email" &&
          job.payload.context === "organizationBilling.billingEmailChanged" &&
          job.payload.subject.includes("請求先メールアドレスを変更しました"),
      ),
    ).toBe(true);
    expect(jobs.some((job) => job.channel === "line")).toBe(false);

    if (jobs[0]?.payload.kind !== "email") throw new Error("email payload not found");
    const actionUrl = extractBillingSettingsActionUrl(jobs[0].payload.html);
    expect(actionUrl.pathname).toBe("/manage/billing");
    expect([...actionUrl.searchParams.entries()]).toEqual([["org", ids.organizationId]]);
  });

  it("支払い不要Pro相当では内部通知actionを直接呼んでも請求先変更通知を作成しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "complimentary_billing_notice",
        complimentary: true,
      }),
    );

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingEmailChangedNotification, {
        organizationId: ids.organizationId,
        eventKey: "complimentary-billing-notice",
      }),
    ).resolves.toEqual({ enqueuedCount: 0 });
    await expect(t.run((ctx) => ctx.db.query("notificationOutbox").collect())).resolves.toEqual([]);
  });
});

function extractBillingSettingsActionUrl(html: string) {
  const href = html.match(/<a href="([^"]+)"[^>]*>シフトリを確認する<\/a>/)?.[1];
  if (!href) throw new Error("billing settings action URL not found");
  return new URL(href);
}
