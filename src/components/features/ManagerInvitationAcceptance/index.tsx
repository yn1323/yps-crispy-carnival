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

type LinkInvitationResult = FunctionReturnType<typeof api.organizationInvitation.mutations.linkAccount>;
type LinkResultStatus = LinkInvitationResult["status"];
type LinkedResult = Extract<LinkInvitationResult, { status: "linked" }>;

type LinkedTarget = Omit<LinkedResult, "status"> & {
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
  const linkAccount = useMutation(api.organizationInvitation.mutations.linkAccount);
  const [linkStatus, setLinkStatus] = useState<LinkResultStatus | null>(null);
  const [linkedTarget, setLinkedTarget] = useState<LinkedTarget | null>(null);
  const [failedLinkToken, setFailedLinkToken] = useState<string | null>(null);
  const invitationRedirect = useMemo(() => buildManagerInvitationRedirect(token), [token]);
  const shops = useMemo(() => normalizeShopContextOptions(rawShops ?? []), [rawShops]);
  const destinationShop = linkedTarget?.shopId
    ? findAcceptedShopContext(shops, {
        organizationId: linkedTarget.organizationId,
        shopId: linkedTarget.shopId,
      })
    : null;

  useEffect(() => {
    if (!destinationShop) return;
    void navigate({ to: "/dashboard", search: { shop: destinationShop.shopId }, replace: true });
  }, [destinationShop, navigate]);

  const { run: linkOnce, isRunning: isLinking } = useSingleFlight(async () => {
    if (!token || !isAuthenticated) return;

    setFailedLinkToken(null);
    try {
      const result = await linkAccount({ token });
      if (result.status === "linked") {
        setLinkedTarget({
          organizationId: result.organizationId,
          shopId: result.shopId,
          organizationName: preview?.status === "ready" ? preview.organizationName : null,
        });
      }
      setLinkStatus(result.status);
    } catch {
      setFailedLinkToken(token);
    }
  });

  useEffect(() => {
    if (
      !token ||
      !isAuthenticated ||
      preview?.status !== "ready" ||
      linkStatus !== null ||
      failedLinkToken === token ||
      isLinking
    ) {
      return;
    }
    void linkOnce();
  }, [failedLinkToken, isAuthenticated, isLinking, linkOnce, linkStatus, preview?.status, token]);

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
    linkStatus,
    linkedTarget,
    destinationShopFound: destinationShop !== null,
    isDestinationLoading: rawShops === undefined,
    isLinking,
    didLinkRequestFail: failedLinkToken === token,
    isSwitchingAccount,
  });

  return (
    <ManagerInvitationAcceptanceView
      state={state}
      actions={{
        onAccept: () => void linkOnce(),
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
  linkStatus,
  linkedTarget,
  destinationShopFound,
  isDestinationLoading,
  isLinking,
  didLinkRequestFail,
  isSwitchingAccount,
}: {
  token: string | undefined;
  preview: InvitationPreview;
  isClerkLoaded: boolean;
  isSignedIn: boolean;
  isAuthenticated: boolean;
  isConvexAuthLoading: boolean;
  linkStatus: LinkResultStatus | null;
  linkedTarget: LinkedTarget | null;
  destinationShopFound: boolean;
  isDestinationLoading: boolean;
  isLinking: boolean;
  didLinkRequestFail: boolean;
  isSwitchingAccount: boolean;
}): ManagerInvitationAcceptanceViewState {
  if (!token) return { kind: "invalid" };

  if (linkStatus === "linked") {
    if (!linkedTarget) return { kind: "unavailable" };
    return {
      kind: "accepted",
      organizationName: linkedTarget.organizationName,
      isPreparingDestination: linkedTarget.shopId !== undefined && !destinationShopFound && isDestinationLoading,
      hasDestination: destinationShopFound,
    };
  }
  if (linkStatus === "emailMismatch") return { kind: "emailMismatch", isSwitchingAccount };
  if (linkStatus === "conflict") return { kind: "conflict", isAccepting: isLinking };
  if (linkStatus) return { kind: linkStatus };
  if (didLinkRequestFail) return { kind: "retryableError", isRetrying: isLinking };

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
    isAccepting: isLinking,
  };
}

export type {
  ManagerInvitationAcceptanceViewProps,
  ManagerInvitationAcceptanceViewState,
} from "./ManagerInvitationAcceptanceView";
export { ManagerInvitationAcceptanceView } from "./ManagerInvitationAcceptanceView";
