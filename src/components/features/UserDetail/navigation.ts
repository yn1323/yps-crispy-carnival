import { toUserListCountSearch } from "@/src/lib/userListSearch";
import type { UserDetailReturnTo, UserDetailTab } from "./types";

type UserDetailSearchUpdate = {
  shop?: string;
  tab?: UserDetailTab;
};

export function mergeUserDetailSearch<T extends Record<string, unknown>>(previous: T, next: UserDetailSearchUpdate) {
  return { ...previous, ...next };
}

export function getUserDetailBackDestination(
  returnTo: UserDetailReturnTo,
  selectedShopId: string | null,
  visibleUserCount: number,
  focusedPersonId: string,
  returnShopId?: string | null,
) {
  const shopDetailId = returnShopId ?? selectedShopId;
  if (returnTo === "shopDetail" && shopDetailId) {
    return {
      to: "/shops/$shopId" as const,
      params: { shopId: shopDetailId },
      search: { shop: shopDetailId },
    };
  }

  return {
    to: returnTo === "settings" ? ("/settings" as const) : ("/dashboard" as const),
    search: {
      shop: selectedShopId ?? undefined,
      users: toUserListCountSearch(visibleUserCount),
      focus: focusedPersonId,
    },
  };
}
