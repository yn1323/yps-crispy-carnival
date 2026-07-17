import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("m015 organization invitation lifecycle migration", () => {
  it("旧statusと連携情報を新ライフサイクルへ移し、再実行しても人物を増やさない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "invitation_m015_owner", plan: "pro" });
      const now = Date.now();
      const pendingInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "new-person@example.com",
        emailNormalized: "new-person@example.com",
        tokenDigest: "legacy-pending-digest",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      const acceptedInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "owner@example.com",
        emailNormalized: "owner@example.com",
        tokenDigest: "legacy-accepted-digest",
        status: "accepted",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        targetPersonId: base.personId,
        reservedSeat: false,
        version: 2,
        expiresAt: now + 86_400_000,
        acceptedAt: now,
        acceptedByPersonId: base.personId,
        createdAt: now - 1_000,
        updatedAt: now,
      });
      return { ...base, acceptedInvitationId, pendingInvitationId };
    });

    await t.mutation(internal.migrations.m015_organization_invitations_link_lifecycle.migration, {
      cursor: null,
      dryRun: false,
    });
    await t.mutation(internal.migrations.m015_organization_invitations_link_lifecycle.migration, {
      cursor: null,
      dryRun: false,
    });

    const state = await t.run(async (ctx) => ({
      pending: await ctx.db.get(ids.pendingInvitationId),
      linked: await ctx.db.get(ids.acceptedInvitationId),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("status", "active"),
        )
        .collect(),
    }));
    expect(state.pending).toMatchObject({ status: "issued", invitedName: "new-person" });
    expect(state.linked).toMatchObject({
      status: "linked",
      invitedName: "管理者",
      linkedAt: expect.any(Number),
      linkedByPersonId: ids.personId,
    });
    expect(state.people).toHaveLength(1);
  });
});
