import { createFileRoute } from "@tanstack/react-router";
import { AppManageShopDetailPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/manage_/shops/$shopId")({
  head: () => buildAppPrototypePageHead("店舗詳細"),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageShopDetailPage,
});
