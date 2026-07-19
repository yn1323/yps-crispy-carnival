import { createFileRoute } from "@tanstack/react-router";
import { ShopDetailPage } from "@/src/pages/shop-detail";
import { buildShopDetailPageHead } from "@/src/pages/shop-detail/meta";

type ShopDetailTab = "information" | "settings";
type ShopDetailSearch = {
  shop?: string;
  tab: ShopDetailTab;
};

export const Route = createFileRoute("/_auth/shops/$shopId")({
  head: buildShopDetailPageHead,
  validateSearch: validateShopDetailSearch,
  component: ShopDetailRoute,
});

export function validateShopDetailSearch(search: Record<string, unknown>): ShopDetailSearch {
  const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
  const tab = isShopDetailTab(search.tab) ? search.tab : "information";
  return { ...(shop ? { shop } : {}), tab };
}

function ShopDetailRoute() {
  const { shopId } = Route.useParams();
  const { shop, tab } = Route.useSearch();
  return <ShopDetailPage shopId={shopId} selectedShopId={shop} defaultTab={tab} />;
}

function isShopDetailTab(value: unknown): value is ShopDetailTab {
  return value === "information" || value === "settings";
}
