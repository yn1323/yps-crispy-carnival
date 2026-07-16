import { createFileRoute } from "@tanstack/react-router";
import { ShopSelectPage } from "@/src/pages/shop-select";
import { buildShopSelectPageHead } from "@/src/pages/shop-select/meta";

export const Route = createFileRoute("/_auth/shop-select")({
  head: buildShopSelectPageHead,
  component: ShopSelectPage,
});
