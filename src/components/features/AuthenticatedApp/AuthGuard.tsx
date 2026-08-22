import { useAuth } from "@clerk/react";
import { Navigate, useMatches, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom, useSetAtom } from "jotai";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { normalizeAuthRedirect } from "@/src/lib/auth/redirect";
import { selectedShopAtom } from "@/src/stores/shop";
import { EMPTY_USER, userAtom } from "@/src/stores/user";
import { MOBILE_APP_NAVIGATION_HEIGHT } from "./AppPrimaryNavigation";
import { resolveAppShellRouteData } from "./appRoutePolicy";
import { DeletedAccountState } from "./DeletedAccountState";

const RETIRED_ACCOUNT_EMAIL_CLEANUP_STORAGE_KEY = "account-email-cleanup-session";

type Props = {
  children: React.ReactNode;
};

export const AuthGuard = ({ children }: Props) => {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const appShell = resolveAppShellRouteData(useMatches());
  const location = useRouterState({ select: (state) => state.location });
  const [user, setUser] = useAtom(userAtom);
  const setSelectedShop = useSetAtom(selectedShopAtom);
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, isSignedIn ? {} : "skip");
  const isAccountDeleted = Boolean(currentUser && "accountDeleted" in currentUser);
  const accountDeletionRequested = Boolean(
    isAccountDeleted &&
      currentUser &&
      "accountDeletionRequested" in currentUser &&
      currentUser.accountDeletionRequested === true,
  );
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    try {
      window.sessionStorage.removeItem(RETIRED_ACCOUNT_EMAIL_CLEANUP_STORAGE_KEY);
    } catch {
      // storageを利用できない環境でも、廃止済みの復旧処理を再開せず通常画面を継続する。
    }
  }, [isLoaded, isSignedIn]);

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

  const isUserContextReady = Boolean(userId && currentUser && !isAccountDeleted) && user.authId === userId;

  // ログアウト・セッション失効時は userAtom が残っていても必ずログインへ戻す。
  // （queryは未認証時にthrowせず空を返すため、エラー経由のリダイレクトは発生しない）
  if (isLoaded && !isSignedIn) {
    // 初回の保護route読込では、route validation中のstateから親routeのqueryが欠けることがある。
    // client側の実URLを正として、店舗contextを含む元の遷移先を維持する。
    const browserLocation =
      typeof window === "undefined"
        ? `${location.pathname}${location.searchStr}`
        : `${window.location.pathname}${window.location.search}`;
    return <Navigate to="/login" search={{ redirect: normalizeAuthRedirect(browserLocation) }} />;
  }

  // 古いatomやURLが残っていても、削除済み状態を通常画面より先に確定する。
  if (isAccountDeleted) return <DeletedAccountState accountDeletionRequested={accountDeletionRequested} />;

  const mobileNavigationHeight = appShell?.mode === "navigation" ? MOBILE_APP_NAVIGATION_HEIGHT : undefined;

  if (!isLoaded) {
    return <FullPageSpinner showHeader mobileNavigationHeight={mobileNavigationHeight} />;
  }

  if (currentUser === undefined) {
    return <FullPageSpinner showHeader mobileNavigationHeight={mobileNavigationHeight} />;
  }

  if (!isUserContextReady) {
    return <FullPageSpinner showHeader mobileNavigationHeight={mobileNavigationHeight} />;
  }

  return children;
};
