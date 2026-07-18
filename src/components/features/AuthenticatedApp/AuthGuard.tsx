import { useAuth } from "@clerk/clerk-react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { normalizeAuthRedirect } from "@/src/lib/auth/redirect";
import {
  isSameSelectedShop,
  isSelectableShop,
  normalizeShopContextOptions,
  selectedShopAtom,
  toSelectedShop,
} from "@/src/stores/shop";
import { EMPTY_USER, userAtom } from "@/src/stores/user";
import { DeletedAccountState } from "./DeletedAccountState";
import { resolveShopContext } from "./shopContextResolver";

type Props = {
  children: React.ReactNode;
  requestedShopId?: string;
  onNormalizeShopUrl?: (shopId: string) => void;
  onReturnToDashboard?: () => void;
};

export const AuthGuard = ({ children, requestedShopId, onNormalizeShopUrl, onReturnToDashboard }: Props) => {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const location = useRouterState({ select: (state) => state.location });
  const [user, setUser] = useAtom(userAtom);
  const [selectedShop, setSelectedShop] = useAtom(selectedShopAtom);
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, isSignedIn ? {} : "skip");
  const isAccountDeleted = Boolean(currentUser && "accountDeleted" in currentUser);
  const accountDeletionRequested = Boolean(
    isAccountDeleted &&
      currentUser &&
      "accountDeletionRequested" in currentUser &&
      currentUser.accountDeletionRequested === true,
  );
  const myShops = useQuery(
    api.dashboard.queries.getMyShops,
    isSignedIn && currentUser !== undefined && !isAccountDeleted ? {} : "skip",
  );
  const selectableShops = useMemo(
    () => (myShops ? normalizeShopContextOptions(myShops).filter(isSelectableShop) : []),
    [myShops],
  );
  const shopContextResolution = useMemo(
    () =>
      myShops === undefined
        ? null
        : resolveShopContext({
            requestedShopId,
            selectedShop,
            shops: selectableShops,
          }),
    [myShops, requestedShopId, selectedShop, selectableShops],
  );

  useEffect(() => {
    if (userId && currentUser && !("accountDeleted" in currentUser)) {
      setUser({
        authId: userId,
        name: currentUser.name ?? "",
        email: currentUser.email ?? "",
      });
    }
  }, [userId, currentUser, setUser]);

  useEffect(() => {
    if (!isAccountDeleted) return;
    setUser(EMPTY_USER);
    setSelectedShop(null);
  }, [isAccountDeleted, setSelectedShop, setUser]);

  // URLはAPI由来の候補に一致する場合だけ採用する。URLがなければ保存値、候補先頭の順で補完する。
  useEffect(() => {
    if (!shopContextResolution) return;

    if (shopContextResolution.kind === "empty") {
      if (selectedShop !== null) {
        setSelectedShop(null);
      }
      return;
    }

    if (shopContextResolution.kind === "invalidRequestedShop") return;

    const resolvedShop = shopContextResolution.shop;

    // URL文字列をatomへ入れず、所属queryで確認できたDTOだけを同期する。
    if (!isSameSelectedShop(selectedShop, resolvedShop)) {
      setSelectedShop(toSelectedShop(resolvedShop));
      return;
    }

    if (shopContextResolution.shouldNormalizeUrl) {
      onNormalizeShopUrl?.(resolvedShop.shopId);
    }
  }, [onNormalizeShopUrl, selectedShop, setSelectedShop, shopContextResolution]);

  // 同じ店舗でも課金プランなどの保存済みcontextが古い間は子画面を描画せず、誤った対象判定を防ぐ。
  const isShopContextReady =
    shopContextResolution?.kind === "empty"
      ? selectedShop === null
      : shopContextResolution?.kind === "resolved" &&
        !shopContextResolution.shouldNormalizeUrl &&
        isSameSelectedShop(selectedShop, shopContextResolution.shop);

  // ログアウト・セッション失効時は userAtom が残っていても必ずログインへ戻す。
  // （queryは未認証時にthrowせず空を返すため、エラー経由のリダイレクトは発生しない）
  if (isLoaded && !isSignedIn) {
    return (
      <Navigate to="/login" search={{ redirect: normalizeAuthRedirect(`${location.pathname}${location.searchStr}`) }} />
    );
  }

  // 古いatomやURLが残っていても、削除済み状態を通常画面より先に確定する。
  if (isAccountDeleted) return <DeletedAccountState accountDeletionRequested={accountDeletionRequested} />;

  if (user.authId && isShopContextReady) {
    return children;
  }

  if (!isLoaded) {
    return <FullPageSpinner showHeader />;
  }

  if (currentUser === undefined || shopContextResolution === null) {
    return <FullPageSpinner showHeader />;
  }

  if (shopContextResolution.kind === "invalidRequestedShop") {
    return (
      <Empty
        icon={LuStore}
        title="この店舗を開けません"
        description="店舗が削除されたか、この店舗を利用する権限がありません。ダッシュボードから利用できる店舗を選び直してください。"
        tone="warning"
        minH="100dvh"
        action={
          <Button onClick={onReturnToDashboard} colorPalette="teal">
            ダッシュボードへ戻る
          </Button>
        }
      />
    );
  }

  if (!isShopContextReady) {
    return <FullPageSpinner showHeader />;
  }

  return children;
};
