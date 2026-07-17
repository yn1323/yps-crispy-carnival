import { useAuth, useClerk } from "@clerk/clerk-react";
import { useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { normalizeShopContextOptions } from "@/src/stores/shop";
import {
  ManagerInvitationAcceptanceView,
  type ManagerInvitationAcceptanceViewState,
} from "./ManagerInvitationAcceptanceView";
import {
  buildManagerInvitationLoginUrl,
  buildManagerInvitationRedirect,
  findAcceptedShopContext,
  formatManagerInvitationExpiry,
} from "./script";

type AcceptInvitationResult = FunctionReturnType<typeof api.organizationInvitation.mutations.accept>;
type AcceptResultStatus = AcceptInvitationResult["status"];
type AcceptedResult = Extract<AcceptInvitationResult, { status: "accepted" }>;

type AcceptedTarget = Omit<AcceptedResult, "status"> & {
  organizationName: string | null;
};

type Props = {
  token: string | undefined;
};

export function ManagerInvitationAcceptance({ token }: Props) {
  const navigate = useNavigate();
  const clerk = useClerk();
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const preview = useQuery(api.organizationInvitation.queries.getPreview, token ? { token } : "skip");
  const rawShops = useQuery(api.dashboard.queries.getMyShops, isAuthenticated ? {} : "skip");
  const acceptInvitation = useMutation(api.organizationInvitation.mutations.accept);
  const [acceptStatus, setAcceptStatus] = useState<AcceptResultStatus | null>(null);
  const [acceptedTarget, setAcceptedTarget] = useState<AcceptedTarget | null>(null);
  const invitationRedirect = useMemo(() => buildManagerInvitationRedirect(token), [token]);
  const shops = useMemo(() => normalizeShopContextOptions(rawShops ?? []), [rawShops]);
  const destinationShop = acceptedTarget?.shopId
    ? findAcceptedShopContext(shops, {
        organizationId: acceptedTarget.organizationId,
        shopId: acceptedTarget.shopId,
      })
    : null;

  useEffect(() => {
    if (!destinationShop) return;
    void navigate({ to: "/dashboard", search: { shop: destinationShop.shopId }, replace: true });
  }, [destinationShop, navigate]);

  const { run: acceptOnce, isRunning: isAccepting } = useSingleFlight(async () => {
    if (!token || !isAuthenticated) return;

    try {
      const result = await acceptInvitation({ token });
      if (result.status === "accepted") {
        setAcceptedTarget({
          organizationId: result.organizationId,
          shopId: result.shopId,
          organizationName: preview?.status === "ready" ? preview.organizationName : null,
        });
      }
      setAcceptStatus(result.status);
    } catch {
      setAcceptStatus("unavailable");
    }
  });

  const { run: switchAccount, isRunning: isSwitchingAccount } = useSingleFlight(async () => {
    try {
      await clerk.signOut({ redirectUrl: buildManagerInvitationLoginUrl(invitationRedirect) });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const state = resolveViewState({
    token,
    preview,
    isClerkLoaded,
    isSignedIn: isSignedIn === true,
    isAuthenticated,
    isConvexAuthLoading,
    acceptStatus,
    acceptedTarget,
    destinationShopFound: destinationShop !== null,
    isDestinationLoading: rawShops === undefined,
    isAccepting,
    isSwitchingAccount,
  });

  return (
    <ManagerInvitationAcceptanceView
      state={state}
      actions={{
        onAccept: () => void acceptOnce(),
        onLogin: () => void navigate({ to: "/login", search: { redirect: invitationRedirect } }),
        onSignup: () => void navigate({ to: "/signup", search: { redirect: invitationRedirect } }),
        onSwitchAccount: () => void switchAccount(),
        onGoToDashboard: () => void navigate({ to: "/dashboard" }),
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
  acceptStatus,
  acceptedTarget,
  destinationShopFound,
  isDestinationLoading,
  isAccepting,
  isSwitchingAccount,
}: {
  token: string | undefined;
  preview: InvitationPreview;
  isClerkLoaded: boolean;
  isSignedIn: boolean;
  isAuthenticated: boolean;
  isConvexAuthLoading: boolean;
  acceptStatus: AcceptResultStatus | null;
  acceptedTarget: AcceptedTarget | null;
  destinationShopFound: boolean;
  isDestinationLoading: boolean;
  isAccepting: boolean;
  isSwitchingAccount: boolean;
}): ManagerInvitationAcceptanceViewState {
  if (!token) return { kind: "invalid" };

  if (acceptStatus === "accepted") {
    if (!acceptedTarget) return { kind: "unavailable" };
    return {
      kind: "accepted",
      organizationName: acceptedTarget.organizationName,
      isPreparingDestination: acceptedTarget.shopId !== undefined && !destinationShopFound && isDestinationLoading,
      hasDestination: destinationShopFound,
    };
  }
  if (acceptStatus === "emailMismatch") return { kind: "emailMismatch", isSwitchingAccount };
  if (acceptStatus === "conflict") return { kind: "conflict", isAccepting };
  if (acceptStatus) return { kind: acceptStatus };

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
  ManagerInvitationAcceptanceViewProps,
  ManagerInvitationAcceptanceViewState,
} from "./ManagerInvitationAcceptanceView";
export { ManagerInvitationAcceptanceView } from "./ManagerInvitationAcceptanceView";
