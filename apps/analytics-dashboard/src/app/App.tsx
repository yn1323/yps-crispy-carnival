import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CycleDetailPage } from "@/pages/CycleDetailPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OrganizationDetailPage } from "@/pages/OrganizationDetailPage";
import { OrganizationsPage } from "@/pages/OrganizationsPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { RequestsPage } from "@/pages/RequestsPage";
import { ShopDetailPage } from "@/pages/ShopDetailPage";
import { ShopsPage } from "@/pages/ShopsPage";
import { useAppRoute } from "@/routes/appRoute";

export const App = () => {
  const { navigate, route } = useAppRoute();
  let page: ReactNode;
  switch (route.name) {
    case "overview":
      page = <OverviewPage navigate={navigate} />;
      break;
    case "organizations":
      page = <OrganizationsPage navigate={navigate} />;
      break;
    case "organization":
      page = <OrganizationDetailPage navigate={navigate} organizationId={route.organizationId} />;
      break;
    case "shops":
      page = <ShopsPage navigate={navigate} />;
      break;
    case "shop":
      page = <ShopDetailPage navigate={navigate} shopId={route.shopId} />;
      break;
    case "cycle":
      page = <CycleDetailPage recruitmentId={route.recruitmentId} shopId={route.shopId} />;
      break;
    case "requests":
      page = <RequestsPage />;
      break;
    case "notFound":
      page = <NotFoundPage />;
      break;
  }
  return <AppShell route={route}>{page}</AppShell>;
};
