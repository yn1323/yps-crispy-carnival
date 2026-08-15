import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppShopDetailPage } from "@/src/pages/shop-detail";
import { buildShopDetailPageHead } from "@/src/pages/shop-detail/meta";

export const Route = createFileRoute("/_auth/app_/manage_/shops/$shopId")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: buildShopDetailPageHead,
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageShopDetailRoute,
});

function AppManageShopDetailRoute() {
  const { shopId } = Route.useParams();
  const { organizationId } = useAppOrganizationScope();
  return <AppShopDetailPage shopId={shopId} organizationId={organizationId} />;
}
