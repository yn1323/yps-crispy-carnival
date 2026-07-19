import { createFileRoute } from "@tanstack/react-router";
import { ShopDetailPage } from "@/src/pages/shop-detail";
import { buildShopDetailPageHead } from "@/src/pages/shop-detail/meta";

type ShopDetailSearch = {
  shop?: string;
};

export const Route = createFileRoute("/_auth/shops/$shopId")({
  head: buildShopDetailPageHead,
  validateSearch: validateShopDetailSearch,
  component: ShopDetailRoute,
});

export function validateShopDetailSearch(search: Record<string, unknown>): ShopDetailSearch {
  const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
  return { ...(shop ? { shop } : {}) };
}

function ShopDetailRoute() {
  const { shopId } = Route.useParams();
  const { shop } = Route.useSearch();
  return <ShopDetailPage shopId={shopId} selectedShopId={shop} />;
}
