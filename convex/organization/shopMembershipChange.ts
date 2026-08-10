import type { Id } from "../_generated/dataModel";

export type OrganizationShopOperatingStatus = "active" | "archived" | "planSuspended";

export type OrganizationPersonShopMembershipSnapshotEntry = {
  staffId: Id<"staffs">;
  shopId: Id<"shops">;
  shopStatus: OrganizationShopOperatingStatus;
};

/** 店舗軸の所属変更で一度に表示する人物数。 */
export const ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT = 100;
/** 店舗軸の所属変更で一度に追加・解除できる人物数。 */
export const ORGANIZATION_SHOP_STAFF_MEMBERSHIP_CHANGE_TARGET_LIMIT = 40;

export type OrganizationShopStaffMembershipFingerprintInput = {
  shopId: Id<"shops">;
  shopStatus: OrganizationShopOperatingStatus;
  people: ReadonlyArray<{
    personId: Id<"organizationPeople">;
    name: string;
    emailNormalized: string;
    staffId: Id<"staffs"> | null;
  }>;
  activeStaffs: ReadonlyArray<{
    staffId: Id<"staffs">;
    organizationId: Id<"organizations"> | null;
    organizationPersonId: Id<"organizationPeople"> | null;
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
export const INACTIVE_SHOP_MEMBERSHIP_CHANGE_DISABLED_REASON = "稼働中の店舗だけ所属を変更できます。";

export function organizationShopOperatingStatus(status: OrganizationShopOperatingStatus | undefined) {
  // TODO[narrow]: 全deploymentでm025完走・verifyShopsのstatus残件0確認後にfallbackを削除する。
  return status ?? ("active" as const);
}

export function sortShopIds(shopIds: readonly Id<"shops">[]) {
  return [...shopIds].sort((left, right) => left.localeCompare(right));
}

export function sortMembershipSnapshotEntries(entries: readonly OrganizationPersonShopMembershipSnapshotEntry[]) {
  return [...entries].sort(
    (left, right) =>
      left.shopId.localeCompare(right.shopId) ||
      left.staffId.localeCompare(right.staffId) ||
      left.shopStatus.localeCompare(right.shopStatus),
  );
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** UI snapshotとmutationのOCC確認で同じcanonical representationを使う。 */
export async function createOrganizationPersonShopMembershipFingerprint(
  entries: readonly OrganizationPersonShopMembershipSnapshotEntry[],
) {
  return await sha256Hex(
    JSON.stringify({
      version: 1,
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
      version: 1,
      shopId: input.shopId,
      shopStatus: input.shopStatus,
      people: [...input.people].sort((left, right) => left.personId.localeCompare(right.personId)),
      activeStaffs: [...input.activeStaffs].sort((left, right) => left.staffId.localeCompare(right.staffId)),
      pendingRegistrations: [...input.pendingRegistrations].sort(
        (left, right) =>
          left.emailNormalized.localeCompare(right.emailNormalized) || left.requestId.localeCompare(right.requestId),
      ),
    }),
  );
}
