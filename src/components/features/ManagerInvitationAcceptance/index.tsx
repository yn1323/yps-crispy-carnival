import { useAuth, useClerk, useUser } from "@clerk/react";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { normalizeShopContextOptions } from "@/src/domains/shop/context";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { trackProductEvent } from "@/src/lib/webMeasurement";
import {
  type ManagerInvitationAcceptanceAccount,
  ManagerInvitationAcceptanceView,
  type ManagerInvitationAcceptanceViewState,
} from "./ManagerInvitationAcceptanceView";
import { buildManagerInvitationRedirect, findAcceptedShopContext, formatManagerInvitationExpiry } from "./script";

type AcceptanceResult = FunctionReturnType<typeof api.organizationInvitation.acceptanceActions.accept>;
type LinkedResult = Extract<AcceptanceResult, { status: "linked" }>;

type LinkedTarget = Omit<LinkedResult, "status"> & {
  organizationName: string | null;
};

type Props = {
  token: string | undefined;
};

export function ManagerInvitationAcceptance({ token }: Props) {
  const navigate = useNavigate();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const preview = useQuery(api.organizationInvitation.queries.getPreview, token ? { token } : "skip");
  const rawShops = useQuery(api.dashboard.queries.getMyShops, isAuthenticated ? {} : "skip");
  const acceptInvitation = useAction(api.organizationInvitation.acceptanceActions.accept);
  const [acceptanceResult, setAcceptanceResult] = useState<AcceptanceResult | null>(null);
  const [linkedTarget, setLinkedTarget] = useState<LinkedTarget | null>(null);
  const [failedAcceptanceToken, setFailedAcceptanceToken] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const invitationRedirect = useMemo(() => buildManagerInvitationRedirect(token), [token]);
  const shops = useMemo(() => normalizeShopContextOptions(rawShops ?? []), [rawShops]);
  const destinationShop = linkedTarget?.shopId
    ? findAcceptedShopContext(shops, {
        organizationId: linkedTarget.organizationId,
        shopId: linkedTarget.shopId,
      })
    : null;

  useEffect(() => {
    if (!destinationShop || !linkedTarget) return;
    void navigate({
      to: "/dashboard",
      search: { org: linkedTarget.organizationId, shop: destinationShop.shopId },
      replace: true,
    });
  }, [destinationShop, linkedTarget, navigate]);

  // ログイン済みでも自動では参加させない。どのアカウントで参加するかを見せ、利用者の操作で始める。
  const { run: acceptOnce, isRunning: isAccepting } = useSingleFlight(async () => {
    if (!token || !isAuthenticated) return;

    setFailedAcceptanceToken(null);
    try {
      const result = await acceptInvitation({ token });
      if (result.status === "linked") {
        trackProductEvent({ kind: "manage_action", target: "manager", action: "accept_invite" });
        setLinkedTarget({
          organizationId: result.organizationId,
          shopId: result.shopId,
          organizationName: preview?.status === "ready" ? preview.organizationName : null,
        });
      }
      setAcceptanceResult(result);
    } catch {
      setAcceptanceResult(null);
      setFailedAcceptanceToken(token);
    }
  });

  const { run: logout, isRunning: isLoggingOut } = useSingleFlight(async () => {
    setLogoutError(null);
    try {
      // 同じ招待URLへ戻し、別のアカウントでの登録またはログインからやり直せるようにする。
      await signOut({ redirectUrl: invitationRedirect });
      setAcceptanceResult(null);
      setFailedAcceptanceToken(null);
    } catch {
      setLogoutError("ログアウトできませんでした。もう一度お試しください。");
    }
  });

  const account: ManagerInvitationAcceptanceAccount | null =
    isSignedIn === true && isUserLoaded && user
      ? {
          email: user.primaryEmailAddress?.emailAddress ?? "",
          errorMessage: logoutError,
          isLoggingOut,
        }
      : null;

  const state = resolveViewState({
    token,
    preview,
    isClerkLoaded: isAuthLoaded && (!isSignedIn || isUserLoaded),
    isSignedIn: isSignedIn === true,
    isAuthenticated,
    isConvexAuthLoading,
    acceptanceResult,
    linkedTarget,
    destinationShopFound: destinationShop !== null,
    isDestinationLoading: rawShops === undefined,
    isAccepting,
    didAcceptanceRequestFail: failedAcceptanceToken === token,
  });

  return (
    <ManagerInvitationAcceptanceView
      state={state}
      account={account}
      actions={{
        onAccept: () => void acceptOnce(),
        onLogin: () => void navigate({ to: "/login", search: { redirect: invitationRedirect } }),
        onSignup: () => void navigate({ to: "/signup", search: { redirect: invitationRedirect } }),
        onLogout: () => void logout(),
        onGoToDashboard: () =>
          void navigate({
            to: "/dashboard",
            search: linkedTarget
              ? {
                  org: linkedTarget.organizationId,
                  ...(linkedTarget.shopId ? { shop: linkedTarget.shopId } : {}),
                }
              : {},
          }),
      }}
    />
  );
}

type InvitationPreview = FunctionReturnType<typeof api.organizationInvitation.queries.getPreview> | undefined;

function resolveViewState({
  token,
  preview,
  isClerkLoaded,
  isSignedIn,
  isAuthenticated,
  isConvexAuthLoading,
  acceptanceResult,
  linkedTarget,
  destinationShopFound,
  isDestinationLoading,
  isAccepting,
  didAcceptanceRequestFail,
}: {
  token: string | undefined;
  preview: InvitationPreview;
  isClerkLoaded: boolean;
  isSignedIn: boolean;
  isAuthenticated: boolean;
  isConvexAuthLoading: boolean;
  acceptanceResult: AcceptanceResult | null;
  linkedTarget: LinkedTarget | null;
  destinationShopFound: boolean;
  isDestinationLoading: boolean;
  isAccepting: boolean;
  didAcceptanceRequestFail: boolean;
}): ManagerInvitationAcceptanceViewState {
  if (!token) return { kind: "invalid" };

  if (acceptanceResult?.status === "linked") {
    if (!linkedTarget) return { kind: "unavailable" };
    return {
      kind: "accepted",
      organizationName: linkedTarget.organizationName,
      isPreparingDestination: linkedTarget.shopId !== undefined && !destinationShopFound && isDestinationLoading,
      hasDestination: destinationShopFound,
    };
  }
  if (acceptanceResult?.status === "conflict") {
    return acceptanceResult.accountAlreadyRegistered
      ? {
          kind: "accountAlreadyRegistered",
          organizationName: preview?.status === "ready" ? preview.organizationName : null,
        }
      : { kind: "conflict" };
  }
  if (acceptanceResult) return { kind: acceptanceResult.status };
  if (didAcceptanceRequestFail) return { kind: "retryableError", isRetrying: isAccepting };

  if (!isClerkLoaded || (isSignedIn && isConvexAuthLoading) || preview === undefined) {
    return { kind: "loading" };
  }
  if (isSignedIn && !isAuthenticated) return { kind: "unavailable" };
  if (preview.status !== "ready") return { kind: preview.status };

  return {
    kind: "ready",
    organizationName: preview.organizationName,
    expiresAtLabel: formatManagerInvitationExpiry(preview.expiresAt),
    isSignedIn,
    isAccepting,
  };
}

export type {
  ManagerInvitationAcceptanceAccount,
  ManagerInvitationAcceptanceViewProps,
  ManagerInvitationAcceptanceViewState,
} from "./ManagerInvitationAcceptanceView";
export { ManagerInvitationAcceptanceView } from "./ManagerInvitationAcceptanceView";
