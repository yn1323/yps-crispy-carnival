import { createFileRoute } from "@tanstack/react-router";
import type { UserDetailReturnTo } from "@/src/components/features/UserDetail";
import { parseUserListCount } from "@/src/lib/userListSearch";
import { UserShopDetailPage } from "@/src/pages/user-shop-detail";
import { buildUserShopDetailPageHead } from "@/src/pages/user-shop-detail/meta";

type UserShopDetailSearch = {
  shop?: string;
  returnTo?: UserDetailReturnTo;
  returnShop?: string;
  returnShopTo?: "dashboard";
  users?: number;
};

export const Route = createFileRoute("/_auth/users/$personId_/shops/$targetShopId")({
  head: buildUserShopDetailPageHead,
  validateSearch: validateUserShopDetailSearch,
  component: UserShopDetailRoute,
});

export function validateUserShopDetailSearch(search: Record<string, unknown>): UserShopDetailSearch {
  const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
  const validReturnTo = isUserDetailReturnTo(search.returnTo) ? search.returnTo : undefined;
  const requestedReturnShop =
    typeof search.returnShop === "string" && search.returnShop.trim() !== "" ? search.returnShop : undefined;
  const returnShop = validReturnTo === "shopDetail" ? (requestedReturnShop ?? shop) : undefined;
  const returnTo = validReturnTo === "shopDetail" && !returnShop ? undefined : validReturnTo;
  const returnShopTo = returnTo === "shopDetail" && search.returnShopTo === "dashboard" ? "dashboard" : undefined;
  const users = parseUserListCount(search.users);

  return {
    ...(shop ? { shop } : {}),
    ...(returnTo ? { returnTo } : {}),
    ...(returnShop ? { returnShop } : {}),
    ...(returnShopTo ? { returnShopTo } : {}),
    ...(users ? { users } : {}),
  };
}

function UserShopDetailRoute() {
  const { personId, targetShopId } = Route.useParams();
  const { shop, returnTo, returnShop, returnShopTo, users } = Route.useSearch();

  return (
    <UserShopDetailPage
      personId={personId}
      targetShopId={targetShopId}
      selectedShopId={shop}
      returnTo={returnTo}
      returnShopId={returnShop}
      returnShopTo={returnShopTo}
      visibleUserCount={users}
    />
  );
}

function isUserDetailReturnTo(value: unknown): value is UserDetailReturnTo {
  return value === "dashboard" || value === "settings" || value === "shopDetail";
}
