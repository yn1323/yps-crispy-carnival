import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CycleDetailPage } from "@/pages/CycleDetailPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { RequestsPage } from "@/pages/RequestsPage";
import { ShopDetailPage } from "@/pages/ShopDetailPage";
import { ShopsPage } from "@/pages/ShopsPage";
import { StaffDetailPage } from "@/pages/StaffDetailPage";
import { useAppRoute } from "@/routes/appRoute";

export const App = () => {
  const { navigate, route } = useAppRoute();
  let page: ReactNode;
  switch (route.name) {
    case "overview":
      page = <OverviewPage navigate={navigate} />;
      break;
    case "shops":
      page = <ShopsPage navigate={navigate} />;
      break;
    case "shop":
      page = <ShopDetailPage navigate={navigate} shopId={route.shopId} />;
      break;
    case "staff":
      page = <StaffDetailPage navigate={navigate} shopId={route.shopId} staffId={route.staffId} />;
      break;
    case "cycle":
      page = <CycleDetailPage recruitmentId={route.recruitmentId} shopId={route.shopId} />;
      break;
    case "notifications":
      // 検索条件はURLが正本。条件が変わったら入力中の値も作り直す。
      page = <NotificationsPage key={window.location.search} navigate={navigate} />;
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
