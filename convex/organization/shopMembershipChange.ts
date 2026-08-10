import type { Id } from "../_generated/dataModel";

export type OrganizationShopOperatingStatus = "active" | "archived" | "planSuspended";

export type OrganizationPersonShopMembershipSnapshotEntry = {
  staffId: Id<"staffs">;
  shopId: Id<"shops">;
  shopStatus: OrganizationShopOperatingStatus;
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
