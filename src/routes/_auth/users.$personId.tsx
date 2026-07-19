import { createFileRoute } from "@tanstack/react-router";
import { UserDetailPage, type UserDetailReturnTo } from "@/src/pages/user-detail";
import { buildUserDetailPageHead } from "@/src/pages/user-detail/meta";

type UserDetailTab = "information" | "notification" | "line" | "settings";
type UserDetailSearch = { shop?: string; tab?: UserDetailTab; returnTo?: UserDetailReturnTo };

export const Route = createFileRoute("/_auth/users/$personId")({
  head: buildUserDetailPageHead,
  validateSearch: (search: Record<string, unknown>): UserDetailSearch => {
    const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
    const tab = isUserDetailTab(search.tab) ? search.tab : undefined;
    const returnTo = isUserDetailReturnTo(search.returnTo) ? search.returnTo : undefined;
    return {
      ...(shop ? { shop } : {}),
      ...(tab ? { tab } : {}),
      ...(returnTo ? { returnTo } : {}),
    };
  },
  component: UserDetailRoute,
});

function UserDetailRoute() {
  const { personId } = Route.useParams();
  const { shop, tab, returnTo } = Route.useSearch();
  return <UserDetailPage personId={personId} selectedShopId={shop} defaultTab={tab} returnTo={returnTo} />;
}

function isUserDetailReturnTo(value: unknown): value is UserDetailReturnTo {
  return value === "dashboard" || value === "settings";
}

function isUserDetailTab(value: unknown): value is UserDetailTab {
  return value === "information" || value === "notification" || value === "line" || value === "settings";
}
