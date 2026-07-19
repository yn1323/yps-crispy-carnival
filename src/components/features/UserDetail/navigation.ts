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
) {
  return {
    to: returnTo === "settings" ? ("/settings" as const) : ("/dashboard" as const),
    search: {
      shop: selectedShopId ?? undefined,
      users: toUserListCountSearch(visibleUserCount),
      focus: focusedPersonId,
    },
  };
}
