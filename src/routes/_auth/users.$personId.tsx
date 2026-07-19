import { createFileRoute } from "@tanstack/react-router";
import { parseUserListCount } from "@/src/lib/userListSearch";
import { UserDetailPage, type UserDetailReturnTo } from "@/src/pages/user-detail";
import { buildUserDetailPageHead } from "@/src/pages/user-detail/meta";

type UserDetailTab = "notification" | "line" | "settings";
type UserDetailSearch = {
  shop?: string;
  tab: UserDetailTab;
  returnTo?: UserDetailReturnTo;
  returnShop?: string;
  users?: number;
};

export const Route = createFileRoute("/_auth/users/$personId")({
  head: buildUserDetailPageHead,
  validateSearch: validateUserDetailSearch,
  component: UserDetailRoute,
});

export function validateUserDetailSearch(search: Record<string, unknown>): UserDetailSearch {
  const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
  const tab = isUserDetailTab(search.tab) ? search.tab : "notification";
  const validReturnTo = isUserDetailReturnTo(search.returnTo) ? search.returnTo : undefined;
  const requestedReturnShop =
    typeof search.returnShop === "string" && search.returnShop.trim() !== "" ? search.returnShop : undefined;
  const returnShop = validReturnTo === "shopDetail" ? (requestedReturnShop ?? shop) : undefined;
  const returnTo = validReturnTo === "shopDetail" && !returnShop ? undefined : validReturnTo;
  const users = parseUserListCount(search.users);
  return {
    ...(shop ? { shop } : {}),
    tab,
    ...(returnTo ? { returnTo } : {}),
    ...(returnShop ? { returnShop } : {}),
    ...(users ? { users } : {}),
  };
}

function UserDetailRoute() {
  const { personId } = Route.useParams();
  const { shop, tab, returnTo, returnShop, users } = Route.useSearch();
  return (
    <UserDetailPage
      personId={personId}
      selectedShopId={shop}
      defaultTab={tab}
      returnTo={returnTo}
      returnShopId={returnShop}
      visibleUserCount={users}
    />
  );
}

function isUserDetailReturnTo(value: unknown): value is UserDetailReturnTo {
  return value === "dashboard" || value === "settings" || value === "shopDetail";
}

function isUserDetailTab(value: unknown): value is UserDetailTab {
  return value === "notification" || value === "line" || value === "settings";
}
