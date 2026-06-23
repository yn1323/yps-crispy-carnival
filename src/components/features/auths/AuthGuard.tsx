import { useAuth } from "@clerk/clerk-react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { normalizeAuthRedirect } from "@/src/components/features/AuthPage/redirect";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { selectedShopAtom } from "@/src/stores/shop";
import { userAtom } from "@/src/stores/user";

type Props = {
  children: React.ReactNode;
};

export const AuthGuard = ({ children }: Props) => {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const location = useRouterState({ select: (state) => state.location });
  const [user, setUser] = useAtom(userAtom);
  const [selectedShop, setSelectedShop] = useAtom(selectedShopAtom);
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, isSignedIn ? {} : "skip");
  const myShops = useQuery(api.dashboard.queries.getMyShops, isSignedIn ? {} : "skip");

  useEffect(() => {
    if (userId && currentUser) {
      setUser({
        authId: userId,
        name: currentUser.name ?? "",
        email: currentUser.email ?? "",
      });
    }
  }, [userId, currentUser, setUser]);

  // 選択中店舗を初期化/整合する。未選択 or 保存値が所属一覧から消えた場合は先頭店舗にする。
  // （店舗切替UIは未提供。ここで selectedShopAtom にセットした値が manager 系の shopId として送られる）
  useEffect(() => {
    if (!myShops || myShops.length === 0) return;
    const stillValid = selectedShop && myShops.some((shop) => shop.shopId === selectedShop.shopId);
    if (!stillValid) {
      setSelectedShop({ shopId: myShops[0].shopId, shopName: myShops[0].shopName });
    }
  }, [myShops, selectedShop, setSelectedShop]);

  if (user.authId) {
    return children;
  }

  if (!isLoaded) {
    return <FullPageSpinner showHeader />;
  }

  if (!isSignedIn) {
    return (
      <Navigate to="/login" search={{ redirect: normalizeAuthRedirect(`${location.pathname}${location.searchStr}`) }} />
    );
  }

  if (currentUser === undefined) {
    return <FullPageSpinner showHeader />;
  }

  return children;
};
