import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  missingOrganizationShop: "removed_member_legacy_membership_missing_organization_shop",
  ambiguousOrganizationPerson: "removed_member_legacy_membership_ambiguous_organization_person",
  ambiguousCanonicalMember: "removed_member_legacy_membership_ambiguous_canonical_member",
} as const;

const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);

/** canonical所属がremovedの人物について、同じグループの旧店舗管理権限だけを失効させる。 */
export const migration = migrations.define({
  table: "shopMembers",
  batchSize: 10,
  migrateOne: async (ctx, shopMember) => {
    if (shopMember.isDeleted) {
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "shopMember",
        sourceId: shopMember._id,
        codes: OWNED_CONFLICT_CODES,
      });
      return;
    }
    const shop = await ctx.db.get(shopMember.shopId);
    if (!shop?.organizationId) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: shop?.organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: CONFLICT_CODES.missingOrganizationShop,
      });
      return;
    }
    const organizationId = shop.organizationId;

    const people = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_userId", (q) =>
        q.eq("organizationId", organizationId).eq("userId", shopMember.userId),
      )
      .take(2);
    if (people.length !== 1 || people[0].status !== "active") {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: CONFLICT_CODES.ambiguousOrganizationPerson,
      });
      return;
    }

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", organizationId).eq("personId", people[0]._id),
      )
      .take(2);
    if (
      members.length !== 1 ||
      members[0].organizationId !== organizationId ||
      members[0].userId !== shopMember.userId ||
      people[0].userId !== shopMember.userId
    ) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: CONFLICT_CODES.ambiguousCanonicalMember,
      });
      return;
    }

    // canonicalな管理者所属がremovedになった後だけ、旧所属を失効させる。
    if (members[0].status !== "removed") {
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "shopMember",
        sourceId: shopMember._id,
        codes: OWNED_CONFLICT_CODES,
      });
      return;
    }

    await ctx.db.patch(shopMember._id, { isDeleted: true });
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "shopMember",
      sourceId: shopMember._id,
      codes: OWNED_CONFLICT_CODES,
    });
  },
});
