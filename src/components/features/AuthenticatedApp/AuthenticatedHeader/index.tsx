import { useAtomValue } from "jotai";
import { lazy, Suspense } from "react";
import { FeatureRequestAction } from "@/src/components/features/FeatureRequestDialog";
import { Header } from "@/src/components/templates/Header";
import { hasSelectedShopAtom } from "@/src/stores/shop";

// Clerkに依存するメニューは、認証済み画面でだけ読み込む。
const UserMenu = lazy(() =>
  import("@/src/components/features/UserMenu").then((module) => ({ default: module.UserMenu })),
);

export const AuthenticatedHeader = () => {
  const hasSelectedShop = useAtomValue(hasSelectedShopAtom);
  return (
    <Header
      userActions={
        <>
          {hasSelectedShop && <FeatureRequestAction />}
          <Suspense fallback={null}>
            <UserMenu tone="light" />
          </Suspense>
        </>
      }
    />
  );
};
