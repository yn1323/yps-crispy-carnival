import { toUserListCountSearch } from "@/src/lib/userListSearch";
import type { UserDetailPanel, UserDetailReturnTo } from "./types";

type UserDetailSearchUpdate = {
  panel?: UserDetailPanel;
};

export function mergeUserDetailSearch<T extends Record<string, unknown>>(previous: T, next: UserDetailSearchUpdate) {
  return { ...previous, ...next };
}

export function getUserDetailRouteSearch(
  selectedShopId: string | null,
  returnTo: UserDetailReturnTo,
  visibleUserCount: number,
  returnShopId?: string | null,
  returnShopTo?: "dashboard",
) {
  return {
    shop: selectedShopId ?? undefined,
    returnTo,
    ...(returnTo === "shopDetail" && (returnShopId ?? selectedShopId)
      ? { returnShop: returnShopId ?? selectedShopId ?? undefined }
      : {}),
    ...(returnTo === "shopDetail" && returnShopTo === "dashboard" ? { returnShopTo } : {}),
    users: toUserListCountSearch(visibleUserCount),
  };
}

export function getUserShopDetailDestination(
  personId: string,
  targetShopId: string,
  selectedShopId: string | null,
  returnTo: UserDetailReturnTo,
  visibleUserCount: number,
  returnShopId?: string | null,
  returnShopTo?: "dashboard",
) {
  return {
    to: "/users/$personId/shops/$targetShopId" as const,
    params: { personId, targetShopId },
    search: getUserDetailRouteSearch(selectedShopId, returnTo, visibleUserCount, returnShopId, returnShopTo),
  };
}

export function getUserShopDetailBackDestination(
  personId: string,
  selectedShopId: string | null,
  returnTo: UserDetailReturnTo,
  visibleUserCount: number,
  returnShopId?: string | null,
  returnShopTo?: "dashboard",
) {
  return {
    to: "/users/$personId" as const,
    params: { personId },
    search: getUserDetailRouteSearch(selectedShopId, returnTo, visibleUserCount, returnShopId, returnShopTo),
  };
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
