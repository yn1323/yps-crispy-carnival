import { useAuth, useUser } from "@clerk/react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { normalizeEmail } from "@/convex/_lib/validation";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { normalizeFeatureVisibility } from "@/src/domains/featureVisibility";
import {
  isSameSelectedShop,
  isSelectableShop,
  normalizeShopContextOptions,
  toSelectedShop,
} from "@/src/domains/shop/context";
import { normalizeAuthRedirect } from "@/src/lib/auth/redirect";
import { accountEmailChangeSessionAtom } from "@/src/stores/accountEmail";
import { selectedShopAtom } from "@/src/stores/shop";
import { EMPTY_USER, userAtom } from "@/src/stores/user";
import { AccountEmailMismatchRecovery } from "./AccountEmailMismatchRecovery";
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
  const { isLoaded: isClerkUserLoaded, user: clerkUser } = useUser();
  const location = useRouterState({ select: (state) => state.location });
  const [user, setUser] = useAtom(userAtom);
  const [selectedShop, setSelectedShop] = useAtom(selectedShopAtom);
  const accountEmailChangeSession = useAtomValue(accountEmailChangeSessionAtom);
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, isSignedIn ? {} : "skip");
  const isAccountDeleted = Boolean(currentUser && "accountDeleted" in currentUser);
  const clerkPrimaryEmail = clerkUser?.primaryEmailAddress;
  const verifiedClerkEmail =
    clerkPrimaryEmail?.verification?.status === "verified" ? clerkPrimaryEmail.emailAddress : null;
  const convexEmail = currentUser && !("accountDeleted" in currentUser) ? currentUser.email : null;
  const hasEmailMismatch = Boolean(
    verifiedClerkEmail && convexEmail && normalizeEmail(verifiedClerkEmail) !== normalizeEmail(convexEmail),
  );
  const activeAccountEmailChange = accountEmailChangeSession?.clerkUserId === userId ? accountEmailChangeSession : null;
  const isAppEmailChangeActive = activeAccountEmailChange?.source === "app";
  const isRecoveryEmailChangeActive = activeAccountEmailChange?.source === "recovery";
  const accountDeletionRequested = Boolean(
    isAccountDeleted &&
      currentUser &&
      "accountDeletionRequested" in currentUser &&
      currentUser.accountDeletionRequested === true,
  );
  const currentFeatureVisibility = useMemo(
    () =>
      normalizeFeatureVisibility(
        currentUser && !("accountDeleted" in currentUser) ? currentUser.featureVisibility : undefined,
      ),
    [currentUser],
  );
  const myShops = useQuery(
    api.dashboard.queries.getMyShops,
    isSignedIn &&
      currentUser !== undefined &&
      !isAccountDeleted &&
      !isRecoveryEmailChangeActive &&
      (!hasEmailMismatch || isAppEmailChangeActive)
      ? {}
      : "skip",
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
        featureVisibility: currentFeatureVisibility,
      });
    }
  }, [userId, currentUser, currentFeatureVisibility, setUser]);

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

  // 古いbackendの欠損値も「全て非公開」に正規化し、atomへ反映されるまで子画面を描画しない。
  const isUserContextReady =
    Boolean(userId && currentUser && !isAccountDeleted) &&
    user.authId === userId &&
    user.featureVisibility?.organizationSettingsNavigation ===
      currentFeatureVisibility.organizationSettingsNavigation &&
    user.featureVisibility?.billing === currentFeatureVisibility.billing &&
    user.featureVisibility?.shopMembershipAddition === currentFeatureVisibility.shopMembershipAddition;

  // ログアウト・セッション失効時は userAtom が残っていても必ずログインへ戻す。
  // （queryは未認証時にthrowせず空を返すため、エラー経由のリダイレクトは発生しない）
  if (isLoaded && !isSignedIn) {
    return (
      <Navigate to="/login" search={{ redirect: normalizeAuthRedirect(`${location.pathname}${location.searchStr}`) }} />
    );
  }

  // 古いatomやURLが残っていても、削除済み状態を通常画面より先に確定する。
  if (isAccountDeleted) return <DeletedAccountState accountDeletionRequested={accountDeletionRequested} />;

  if (!isLoaded) {
    return <FullPageSpinner showHeader />;
  }

  if (!isClerkUserLoaded) return <FullPageSpinner showHeader />;

  if (currentUser && !("accountDeleted" in currentUser) && !verifiedClerkEmail) {
    return (
      <Empty
        title="ログインメールを確認できません"
        description="認証サービスで確認済みのログインメールを取得できません。画面を再読み込みしてください。"
        tone="warning"
        minH="100dvh"
      />
    );
  }

  if (
    (isRecoveryEmailChangeActive || (hasEmailMismatch && !isAppEmailChangeActive)) &&
    verifiedClerkEmail &&
    convexEmail
  ) {
    return <AccountEmailMismatchRecovery clerkEmail={verifiedClerkEmail} convexEmail={convexEmail} />;
  }

  if (currentUser === undefined || shopContextResolution === null) {
    return <FullPageSpinner showHeader />;
  }

  if (shopContextResolution.kind === "invalidRequestedShop") {
    return (
      <Empty
        icon={LuStore}
        title="この店舗を開けません"
        description={
          "店舗が削除されたか、この店舗を利用する権限がありません。\nダッシュボードから、利用できる店舗を選び直してください。"
        }
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

  if (!isUserContextReady || !isShopContextReady) {
    return <FullPageSpinner showHeader />;
  }

  return children;
};
