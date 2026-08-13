import {
  LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT,
  LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX,
} from "../constants";
import { organizationShopOperatingStatus } from "../organization/shopMembershipChange";
import { migrations } from "./index";

const migrationError = (code: string) => new Error(`line_common_link_migration:${code}`);

type LegacyFriendshipEvidence = {
  friendshipObservedAt: number;
  friendshipObservationSource: "oauth" | "webhook";
  lastWebhookAt?: number;
  lastWebhookEventId?: string;
  lastWebhookEventTimestamp?: number;
};

function legacyFriendshipEvidence(legacy: {
  linkedAt: number;
  lastWebhookAt?: number;
  lastWebhookEventId?: string;
  lastWebhookEventTimestamp?: number;
}): LegacyFriendshipEvidence {
  const friendshipObservationSource =
    legacy.lastWebhookEventId !== undefined || legacy.lastWebhookEventTimestamp !== undefined ? "webhook" : "oauth";
  return {
    friendshipObservedAt: legacy.lastWebhookEventTimestamp ?? legacy.lastWebhookAt ?? legacy.linkedAt,
    friendshipObservationSource,
    // OAuth証跡が勝った場合は、先に処理した古いWebhook証跡を明示的に消す。
    lastWebhookAt: friendshipObservationSource === "webhook" ? legacy.lastWebhookAt : undefined,
    lastWebhookEventId: friendshipObservationSource === "webhook" ? legacy.lastWebhookEventId : undefined,
    lastWebhookEventTimestamp: friendshipObservationSource === "webhook" ? legacy.lastWebhookEventTimestamp : undefined,
  };
}

/** 同じfriendship状態の証跡をmigration順序に依存しない全順序で選ぶ。 */
function compareFriendshipEvidence(left: LegacyFriendshipEvidence, right: LegacyFriendshipEvidence) {
  if (left.friendshipObservedAt !== right.friendshipObservedAt) {
    return left.friendshipObservedAt - right.friendshipObservedAt;
  }
  if (left.friendshipObservationSource !== right.friendshipObservationSource) {
    return left.friendshipObservationSource === "webhook" ? 1 : -1;
  }
  const leftEventTimestamp = left.lastWebhookEventTimestamp ?? Number.NEGATIVE_INFINITY;
  const rightEventTimestamp = right.lastWebhookEventTimestamp ?? Number.NEGATIVE_INFINITY;
  if (leftEventTimestamp !== rightEventTimestamp) return leftEventTimestamp - rightEventTimestamp;
  const eventIdOrder = (left.lastWebhookEventId ?? "").localeCompare(right.lastWebhookEventId ?? "");
  if (eventIdOrder !== 0) return eventIdOrder;
  return (left.lastWebhookAt ?? Number.NEGATIVE_INFINITY) - (right.lastWebhookAt ?? Number.NEGATIVE_INFINITY);
}

/**
 * readinessで単店舗・一人物一LINEを証明したdeploymentだけで使う条件付き変換。
 * 対象を推測で修復せず、不変条件違反はPIIを含まない有限codeで停止する。
 */
export const migration = migrations.define({
  table: "staffLineAccounts",
  migrateOne: async (ctx, legacy) => {
    if (legacy.isDeleted) return;

    const staff = await ctx.db.get(legacy.staffId);
    if (!staff || staff.isDeleted || staff.shopId !== legacy.shopId) throw migrationError("invalid_active_staff");
    if (!staff.organizationId || !staff.organizationPersonId) throw migrationError("missing_canonical_staff_scope");
    const organizationId = staff.organizationId;
    const organizationPersonId = staff.organizationPersonId;
    const [organization, shop, person, activeStaffAccounts, personStaffHistory] = await Promise.all([
      ctx.db.get(organizationId),
      ctx.db.get(staff.shopId),
      ctx.db.get(organizationPersonId),
      ctx.db
        .query("staffLineAccounts")
        .withIndex("by_staffId", (q) => q.eq("staffId", staff._id))
        .filter((q) => q.eq(q.field("isDeleted"), false))
        .take(2),
      ctx.db
        .query("staffs")
        .withIndex("by_organizationId_and_organizationPersonId_and_isDeleted", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("organizationPersonId", organizationPersonId)
            .eq("isDeleted", false),
        )
        .take(LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT + 1),
    ]);
    if (!organization || organization.isDeleted || !shop || shop.isDeleted || person?.status !== "active") {
      throw migrationError("inactive_canonical_scope");
    }
    if (shop.organizationId !== organizationId || person.organizationId !== organizationId) {
      throw migrationError("tenant_mismatch");
    }
    if (activeStaffAccounts.length !== 1 || activeStaffAccounts[0]._id !== legacy._id) {
      throw migrationError("multiple_active_accounts_for_staff");
    }
    if (personStaffHistory.length > LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT) {
      throw migrationError("person_staff_history_limit");
    }
    const personStaffShops = await Promise.all(
      personStaffHistory.map(async (personStaff) => await ctx.db.get(personStaff.shopId)),
    );
    const activePersonStaffs = personStaffHistory.filter((_personStaff, index) => {
      const personStaffShop = personStaffShops[index];
      return (
        personStaffShop !== null &&
        !personStaffShop.isDeleted &&
        personStaffShop.organizationId === organizationId &&
        organizationShopOperatingStatus(personStaffShop.operatingStatus) === "active"
      );
    });
    if (activePersonStaffs.length !== 1 || activePersonStaffs[0]._id !== staff._id) {
      throw migrationError("multiple_active_staffs_for_person");
    }

    const providerCandidates = await ctx.db
      .query("lineProviderUsers")
      .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", legacy.lineUserId).eq("isDeleted", false))
      .take(2);
    if (providerCandidates.length > 1) throw migrationError("duplicate_provider_user");

    const candidateEvidence = legacyFriendshipEvidence(legacy);
    let provider = providerCandidates[0];
    if (provider && provider.following !== legacy.following) throw migrationError("friendship_state_conflict");
    if (!provider) {
      const providerId = await ctx.db.insert("lineProviderUsers", {
        lineUserId: legacy.lineUserId,
        following: legacy.following,
        stateVersion: 1,
        ...candidateEvidence,
        isDeleted: false,
      });
      const insertedProvider = await ctx.db.get(providerId);
      if (!insertedProvider) throw migrationError("provider_insert_failed");
      provider = insertedProvider;
    } else {
      const providerEvidence: LegacyFriendshipEvidence = {
        friendshipObservedAt: provider.friendshipObservedAt,
        friendshipObservationSource: provider.friendshipObservationSource,
        lastWebhookAt: provider.lastWebhookAt,
        lastWebhookEventId: provider.lastWebhookEventId,
        lastWebhookEventTimestamp: provider.lastWebhookEventTimestamp,
      };
      if (compareFriendshipEvidence(candidateEvidence, providerEvidence) > 0) {
        await ctx.db.patch(provider._id, candidateEvidence);
        const mergedProvider = await ctx.db.get(provider._id);
        if (!mergedProvider) throw migrationError("provider_merge_failed");
        provider = mergedProvider;
      }
    }

    const [personLinks, providerOrganizationLinks, providerLinks] = await Promise.all([
      ctx.db
        .query("organizationPersonLineLinks")
        .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
          q.eq("organizationPersonId", organizationPersonId).eq("isDeleted", false),
        )
        .take(2),
      ctx.db
        .query("organizationPersonLineLinks")
        .withIndex("by_organizationId_and_lineProviderUserId_and_isDeleted", (q) =>
          q.eq("organizationId", organizationId).eq("lineProviderUserId", provider._id).eq("isDeleted", false),
        )
        .take(2),
      ctx.db
        .query("organizationPersonLineLinks")
        .withIndex("by_lineProviderUserId_and_isDeleted", (q) =>
          q.eq("lineProviderUserId", provider._id).eq("isDeleted", false),
        )
        .take(LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX + 1),
    ]);
    if (personLinks.length > 1) throw migrationError("duplicate_person_link");
    if (providerOrganizationLinks.length > 1) throw migrationError("duplicate_organization_provider_link");
    if (providerOrganizationLinks[0] && providerOrganizationLinks[0].organizationPersonId !== organizationPersonId) {
      throw migrationError("organization_provider_owner_conflict");
    }

    const existingLink = personLinks[0];
    if (existingLink) {
      if (
        existingLink.organizationId !== organizationId ||
        existingLink.lineProviderUserId !== provider._id ||
        existingLink.generation !== (person.lineLinkGeneration ?? 0)
      ) {
        throw migrationError("person_link_conflict");
      }
      return;
    }
    if (providerLinks.length >= LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX) {
      throw migrationError("provider_link_limit");
    }

    const generation = (person.lineLinkGeneration ?? 0) + 1;
    await ctx.db.insert("organizationPersonLineLinks", {
      organizationId,
      organizationPersonId,
      lineProviderUserId: provider._id,
      generation,
      linkedAt: legacy.linkedAt,
      isDeleted: false,
    });
    await ctx.db.patch(person._id, { lineLinkGeneration: generation, updatedAt: Date.now() });
  },
});
