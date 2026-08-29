import type { Id } from "../_generated/dataModel";
import { sha256Hex } from "../_lib/sha256";
import { ORGANIZATION_PLAN_LIMITS } from "../organizationBilling/planLimits";

export type OrganizationPersonShopMembershipSnapshotEntry = {
  staffId: Id<"staffs">;
  shopId: Id<"shops">;
};

/** 店舗軸の所属変更で一度に表示する人物数。 */
export const ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT = 100;
/** 店舗軸の所属変更で一度に追加・解除できる人物数。 */
export const ORGANIZATION_SHOP_STAFF_MEMBERSHIP_CHANGE_TARGET_LIMIT = ORGANIZATION_PLAN_LIMITS.pro.maxPeople;

export type OrganizationShopStaffMembershipFingerprintInput = {
  shopId: Id<"shops">;
  people: ReadonlyArray<{
    personId: Id<"organizationPeople">;
    name: string;
    emailNormalized: string;
    staffId: Id<"staffs"> | null;
  }>;
  activeStaffs: ReadonlyArray<{
    staffId: Id<"staffs">;
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    name: string;
    emailNormalized: string;
  }>;
  pendingRegistrations: ReadonlyArray<{
    requestId: Id<"staffRegistrationRequests">;
    emailNormalized: string;
  }>;
};

export const STALE_SHOP_MEMBERSHIP_CHANGE_ERROR =
  "店舗所属が変更されています。\n最新の内容を確認して、もう一度お試しください。";

export function sortShopIds(shopIds: readonly Id<"shops">[]) {
  return [...shopIds].sort((left, right) => left.localeCompare(right));
}

export function sortMembershipSnapshotEntries(entries: readonly OrganizationPersonShopMembershipSnapshotEntry[]) {
  return [...entries].sort(
    (left, right) => left.shopId.localeCompare(right.shopId) || left.staffId.localeCompare(right.staffId),
  );
}

/** UI snapshotとmutationのOCC確認で同じcanonical representationを使う。 */
export async function createOrganizationPersonShopMembershipFingerprint(
  entries: readonly OrganizationPersonShopMembershipSnapshotEntry[],
) {
  return await sha256Hex(
    JSON.stringify({
      version: 2,
      memberships: sortMembershipSnapshotEntries(entries),
    }),
  );
}

/** 店舗詳細のsnapshot queryと更新mutationで同じcanonical representationを使う。 */
export async function createOrganizationShopStaffMembershipFingerprint(
  input: OrganizationShopStaffMembershipFingerprintInput,
) {
  return await sha256Hex(
    JSON.stringify({
      version: 2,
      shopId: input.shopId,
      people: [...input.people].sort((left, right) => left.personId.localeCompare(right.personId)),
      activeStaffs: [...input.activeStaffs].sort((left, right) => left.staffId.localeCompare(right.staffId)),
      pendingRegistrations: [...input.pendingRegistrations].sort(
        (left, right) =>
          left.emailNormalized.localeCompare(right.emailNormalized) || left.requestId.localeCompare(right.requestId),
      ),
    }),
  );
}
