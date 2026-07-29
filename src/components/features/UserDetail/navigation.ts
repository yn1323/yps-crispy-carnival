import { toUserListCountSearch } from "@/src/lib/userListSearch";
import type { UserDetailPanel, UserDetailReturnTo } from "./types";

type UserDetailSearchUpdate = {
  shop?: string;
  panel?: UserDetailPanel;
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
  returnShopTo?: "dashboard",
) {
  const shopDetailId = returnShopId ?? selectedShopId;
  if (returnTo === "shopDetail" && shopDetailId) {
    return {
      to: "/shops/$shopId" as const,
      params: { shopId: shopDetailId },
      search: {
        shop: shopDetailId,
        ...(returnShopTo === "dashboard" ? { returnTo: "dashboard" as const } : {}),
      },
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

export function getUserDetailRemovedDestination(
  returnTo: UserDetailReturnTo,
  selectedShopId: string | null,
  visibleUserCount: number,
  returnShopId?: string | null,
  returnShopTo?: "dashboard",
) {
  const shopDetailId = returnShopId ?? selectedShopId;
  if (returnTo === "shopDetail" && shopDetailId) {
    return {
      to: "/shops/$shopId" as const,
      params: { shopId: shopDetailId },
      search: {
        shop: shopDetailId,
        ...(returnShopTo === "dashboard" ? { returnTo: "dashboard" as const } : {}),
      },
    };
  }

  return {
    to: returnTo === "settings" ? ("/settings" as const) : ("/dashboard" as const),
    search: {
      shop: selectedShopId ?? undefined,
      ...(returnTo === "settings" ? { tab: "people" as const } : {}),
      users: toUserListCountSearch(visibleUserCount),
    },
  };
}
