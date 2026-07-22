import { useRouterState } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { lazy, Suspense } from "react";
import { FeatureRequestAction } from "@/src/components/features/FeatureRequestDialog";
import { ShopSwitcher } from "@/src/components/features/ShopSwitcher";
import { Header } from "@/src/components/templates/Header";
import { hasSelectedShopAtom } from "@/src/stores/shop";

// Clerkに依存するメニューは、認証済み画面でだけ読み込む。
const UserMenu = lazy(() =>
  import("@/src/components/features/UserMenu").then((module) => ({ default: module.UserMenu })),
);

export const AuthenticatedHeader = () => {
  const hasSelectedShop = useAtomValue(hasSelectedShopAtom);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const showShopSwitcher =
    hasSelectedShop &&
    pathname !== "/dashboard" &&
    pathname !== "/settings" &&
    !pathname.startsWith("/shops/") &&
    !pathname.startsWith("/users/");

  return (
    <Header
      userActions={
        <>
          {showShopSwitcher && <ShopSwitcher />}
          {hasSelectedShop && <FeatureRequestAction />}
          <Suspense fallback={null}>
            <UserMenu tone="light" />
          </Suspense>
        </>
      }
    />
  );
};
