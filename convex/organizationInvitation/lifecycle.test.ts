import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { readActiveIssuedInvitationsByOrganization } from "./lifecycle";

describe("organizationInvitation/lifecycle bounded operational reader", () => {
  it("issuedを期限昇順・ID順に並べ、期限切れと別状態を除外する", async () => {
    const t = convexTest(schema, modules);
    const now = Date.parse("2026-08-13T00:00:00Z");
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "lifecycle_reader_owner", plan: "business" });
      const insert = async (status: "issued" | "linked", expiresAt: number, suffix: string) =>
        await ctx.db.insert("organizationInvitations", {
          organizationId: base.organizationId,
          invitedName: suffix,
          email: `${suffix}@example.com`,
          emailNormalized: `${suffix}@example.com`,
          tokenDigest: `digest-${suffix}`,
          status,
          inviterMemberId: base.memberId,
          reservedSeat: true,
          version: 1,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        });
      const issuedLater = await insert("issued", now + 300, "issued-later");
      const issuedSameA = await insert("issued", now + 200, "issued-same-a");
      const issuedSameB = await insert("issued", now + 200, "issued-same-b");
      await insert("issued", now, "expired-boundary");
      await insert("issued", now - 1, "expired-issued");
      await insert("linked", now + 100, "linked");
      return { organizationId: base.organizationId, issuedLater, issuedSameA, issuedSameB };
    });

    const result = await t.run((ctx) => readActiveIssuedInvitationsByOrganization(ctx, ids.organizationId, now, 3));
    expect(result.hasOverflow).toBe(false);
    expect(result.invitations.map((invitation) => invitation._id)).toEqual([
      ...([ids.issuedSameA, ids.issuedSameB] as Id<"organizationInvitations">[]).sort(),
      ids.issuedLater,
    ]);
  });

  it("limit超過を切り捨てず通知する", async () => {
    const t = convexTest(schema, modules);
    const now = Date.parse("2026-08-13T00:00:00Z");
    const organizationId = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "lifecycle_overflow_owner", plan: "business" });
      for (let index = 0; index < 4; index += 1) {
        await ctx.db.insert("organizationInvitations", {
          organizationId: base.organizationId,
          invitedName: `overflow-${index}`,
          email: `overflow-${index}@example.com`,
          emailNormalized: `overflow-${index}@example.com`,
          tokenDigest: `overflow-${index}`,
          status: "issued",
          inviterMemberId: base.memberId,
          reservedSeat: true,
          version: 1,
          expiresAt: now + index + 1,
          createdAt: now,
          updatedAt: now,
        });
      }
      return base.organizationId;
    });

    const result = await t.run((ctx) => readActiveIssuedInvitationsByOrganization(ctx, organizationId, now, 3));
    expect(result.hasOverflow).toBe(true);
    expect(result.invitations).toHaveLength(4);
  });
});
