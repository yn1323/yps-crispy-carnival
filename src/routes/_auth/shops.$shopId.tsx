import { createFileRoute } from "@tanstack/react-router";
import { ShopDetailPage } from "@/src/pages/shop-detail";
import { buildShopDetailPageHead } from "@/src/pages/shop-detail/meta";

type ShopDetailSearch = {
  shop?: string;
  returnTo?: "dashboard" | "settings";
};

export const Route = createFileRoute("/_auth/shops/$shopId")({
  head: buildShopDetailPageHead,
  validateSearch: validateShopDetailSearch,
  component: ShopDetailRoute,
});

export function validateShopDetailSearch(search: Record<string, unknown>): ShopDetailSearch {
  const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
  const returnTo = search.returnTo === "dashboard" || search.returnTo === "settings" ? search.returnTo : undefined;
  return { ...(shop ? { shop } : {}), ...(returnTo ? { returnTo } : {}) };
}

function ShopDetailRoute() {
  const { shopId } = Route.useParams();
  const { shop, returnTo } = Route.useSearch();
  return <ShopDetailPage shopId={shopId} selectedShopId={shop} returnTo={returnTo} />;
}
