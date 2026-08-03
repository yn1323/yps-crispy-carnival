import { createFileRoute } from "@tanstack/react-router";
import type { UserDetailPanel } from "@/src/components/features/UserDetail";
import { parseUserListCount } from "@/src/lib/userListSearch";
import { UserDetailPage, type UserDetailReturnTo } from "@/src/pages/user-detail";
import { buildUserDetailPageHead } from "@/src/pages/user-detail/meta";

type UserDetailSearch = {
  shop?: string;
  panel?: UserDetailPanel;
  returnTo?: UserDetailReturnTo;
  returnShop?: string;
  returnShopTo?: "dashboard";
  users?: number;
};

export const Route = createFileRoute("/_auth/users/$personId")({
  head: buildUserDetailPageHead,
  validateSearch: validateUserDetailSearch,
  component: UserDetailRoute,
});

export function validateUserDetailSearch(search: Record<string, unknown>): UserDetailSearch {
  const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
  const panel = isUserDetailPanel(search.panel) ? search.panel : undefined;
  const validReturnTo = isUserDetailReturnTo(search.returnTo) ? search.returnTo : undefined;
  const requestedReturnShop =
    typeof search.returnShop === "string" && search.returnShop.trim() !== "" ? search.returnShop : undefined;
  const returnShop = validReturnTo === "shopDetail" ? (requestedReturnShop ?? shop) : undefined;
  const returnTo = validReturnTo === "shopDetail" && !returnShop ? undefined : validReturnTo;
  const returnShopTo = returnTo === "shopDetail" && search.returnShopTo === "dashboard" ? "dashboard" : undefined;
  const users = parseUserListCount(search.users);
  return {
    ...(shop ? { shop } : {}),
    ...(panel ? { panel } : {}),
    ...(returnTo ? { returnTo } : {}),
    ...(returnShop ? { returnShop } : {}),
    ...(returnShopTo ? { returnShopTo } : {}),
    ...(users ? { users } : {}),
  };
}

function UserDetailRoute() {
  const { personId } = Route.useParams();
  const { shop, panel, returnTo, returnShop, returnShopTo, users } = Route.useSearch();
  return (
    <UserDetailPage
      personId={personId}
      selectedShopId={shop}
      activePanel={panel}
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

function isUserDetailPanel(value: unknown): value is UserDetailPanel {
  return value === "basic" || value === "email" || value === "addShop";
}
