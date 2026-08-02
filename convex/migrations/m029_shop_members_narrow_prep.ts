import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const CONFLICT_CODES = {
  missingOrganizationShop: "active_legacy_membership_missing_organization_shop",
  missingUser: "active_legacy_membership_missing_user",
  ambiguousOrganizationPerson: "active_legacy_membership_ambiguous_organization_person",
  ambiguousCanonicalMember: "active_legacy_membership_ambiguous_canonical_member",
} as const;

const OWNED_CONFLICT_CODES = Object.values(CONFLICT_CODES);

/**
 * canonical管理者所属と一意に対応する旧shopMembersを論理削除する。
 * authorityを変更するためfixed seriesでは自動実行せず、専用runnerをdry runしてreadinessを確認した後だけ実行する。
 */
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
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: CONFLICT_CODES.missingOrganizationShop,
      });
      return;
    }
    const organizationId = shop.organizationId;
    const user = await ctx.db.get(shopMember.userId);
    if (!user) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: CONFLICT_CODES.missingUser,
      });
      return;
    }

    const people = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_userId", (q) => q.eq("organizationId", organizationId).eq("userId", user._id))
      .take(2);
    if (people.length !== 1 || people[0].organizationId !== organizationId || people[0].userId !== user._id) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: CONFLICT_CODES.ambiguousOrganizationPerson,
      });
      return;
    }

    const [members, personMembers] = await Promise.all([
      ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", user._id).eq("organizationId", organizationId))
        .take(2),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", organizationId).eq("personId", people[0]._id),
        )
        .take(2),
    ]);
    if (
      members.length !== 1 ||
      personMembers.length !== 1 ||
      personMembers[0]._id !== members[0]._id ||
      members[0].organizationId !== organizationId ||
      members[0].personId !== people[0]._id ||
      members[0].userId !== user._id
    ) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: CONFLICT_CODES.ambiguousCanonicalMember,
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
