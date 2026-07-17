import { useAuth } from "@clerk/clerk-react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { normalizeAuthRedirect } from "@/src/lib/auth/redirect";
import {
  isSameSelectedShop,
  isSelectableShop,
  normalizeShopContextOptions,
  selectedShopAtom,
  toSelectedShop,
} from "@/src/stores/shop";
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
  const selectableShops = useMemo(
    () => (myShops ? normalizeShopContextOptions(myShops).filter(isSelectableShop) : []),
    [myShops],
  );
  const selectedCandidate = selectedShop
    ? (selectableShops.find((shop) => shop.shopId === selectedShop.shopId) ?? null)
    : null;
  const isShopSelectionRoute = location.pathname === "/shop-select";

  useEffect(() => {
    if (userId && currentUser) {
      setUser({
        authId: userId,
        name: currentUser.name ?? "",
        email: currentUser.email ?? "",
      });
    }
  }, [userId, currentUser, setUser]);

  // 保存済み店舗を現在の所属情報へ正規化する。候補が複数なら自動選択せず、選択画面へ委ねる。
  useEffect(() => {
    if (!myShops) return;
    if (selectableShops.length === 0) {
      if (selectedShop !== null) {
        setSelectedShop(null);
      }
      return;
    }

    if (!selectedCandidate) {
      if (selectableShops.length === 1) {
        setSelectedShop(toSelectedShop(selectableShops[0]));
      } else if (selectedShop !== null) {
        setSelectedShop(null);
      }
      return;
    }

    if (!isSameSelectedShop(selectedShop, selectedCandidate)) {
      setSelectedShop(toSelectedShop(selectedCandidate));
    }
  }, [myShops, selectableShops, selectedCandidate, selectedShop, setSelectedShop]);

  // 同じ店舗でも課金プランなどの保存済みcontextが古い間は子画面を描画せず、誤った対象判定を防ぐ。
  const hasResolvedShopContext =
    selectableShops.length === 0
      ? selectedShop === null
      : selectedCandidate !== null && isSameSelectedShop(selectedShop, selectedCandidate);
  const isShopContextReady = myShops !== undefined && (isShopSelectionRoute || hasResolvedShopContext);
  const needsShopSelection = myShops !== undefined && selectableShops.length > 1 && selectedCandidate === null;

  // ログアウト・セッション失効時は userAtom が残っていても必ずログインへ戻す。
  // （queryは未認証時にthrowせず空を返すため、エラー経由のリダイレクトは発生しない）
  if (isLoaded && !isSignedIn) {
    return (
      <Navigate to="/login" search={{ redirect: normalizeAuthRedirect(`${location.pathname}${location.searchStr}`) }} />
    );
  }

  if (needsShopSelection && !isShopSelectionRoute) {
    return <Navigate to="/shop-select" replace />;
  }

  if (user.authId && isShopContextReady) {
    return children;
  }

  if (!isLoaded) {
    return <FullPageSpinner showHeader />;
  }

  if (currentUser === undefined || !isShopContextReady) {
    return <FullPageSpinner showHeader />;
  }

  return children;
};
