import { createFileRoute } from "@tanstack/react-router";
import { AppStaffShopDetailPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/staff_/$personId_/shops/$shopId")({
  head: () => buildAppPrototypePageHead("スタッフの店舗別設定"),
  staticData: { appShell: { mode: "navigation", activeKey: "staff" } },
  component: StaffShopDetailRoutePage,
});

function StaffShopDetailRoutePage() {
  const { shopId } = Route.useParams();

  return <AppStaffShopDetailPage shopId={shopId} />;
}
