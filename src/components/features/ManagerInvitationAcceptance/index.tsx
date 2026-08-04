import { useAuth, useReverification, useUser } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { EmailAddressResource } from "@clerk/shared/types";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { normalizeEmail, requiredEmailSchema } from "@/convex/_lib/validation";
import { getClerkErrorMessage } from "@/src/components/features/AuthPage/errorPresentation";
import { maskEmailAddress } from "@/src/components/features/AuthPage/loginVerification";
import { normalizeShopContextOptions } from "@/src/domains/shop/context";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import {
  ManagerInvitationAcceptanceView,
  type ManagerInvitationAcceptanceViewState,
} from "./ManagerInvitationAcceptanceView";
import { buildManagerInvitationRedirect, findAcceptedShopContext, formatManagerInvitationExpiry } from "./script";

type AcceptanceResult = FunctionReturnType<typeof api.organizationInvitation.acceptanceActions.accept>;
type LinkedResult = Extract<AcceptanceResult, { status: "linked" }>;

type LinkedTarget = Omit<LinkedResult, "status"> & {
  organizationName: string | null;
};

type VerificationStep = "input" | "code";

type Props = {
  token: string | undefined;
};

export function ManagerInvitationAcceptance({ token }: Props) {
  const navigate = useNavigate();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const preview = useQuery(api.organizationInvitation.queries.getPreview, token ? { token } : "skip");
  const rawShops = useQuery(api.dashboard.queries.getMyShops, isAuthenticated ? {} : "skip");
  const acceptInvitation = useAction(api.organizationInvitation.acceptanceActions.accept);
  const [acceptanceResult, setAcceptanceResult] = useState<AcceptanceResult | null>(null);
  const [linkedTarget, setLinkedTarget] = useState<LinkedTarget | null>(null);
  const [failedAcceptanceToken, setFailedAcceptanceToken] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState<VerificationStep>("input");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationInfo, setVerificationInfo] = useState<string | null>(null);
  const [maskedVerificationEmail, setMaskedVerificationEmail] = useState("");
  const verificationEmailRef = useRef<EmailAddressResource | null>(null);
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

  const createEmailAddress = useReverification(async (email: string) => {
    if (!user) throw new Error("Clerk user is not available");
    return await user.createEmailAddress({ email });
  });

  const { run: acceptOnce, isRunning: isAccepting } = useSingleFlight(async (afterVerification = false) => {
    if (!token || !isAuthenticated) return;

    setFailedAcceptanceToken(null);
    try {
      const result = await acceptInvitation({ token });
      if (result.status === "linked") {
        setLinkedTarget({
          organizationId: result.organizationId,
          shopId: result.shopId,
          organizationName: preview?.status === "ready" ? preview.organizationName : null,
        });
      }
      if (result.status === "verificationRequired") {
        setVerificationStep("input");
        setVerificationInfo(null);
        setVerificationError(
          afterVerification
            ? "入力したメールアドレスを招待先として確認できませんでした。招待メールの宛先を確認してください。"
            : null,
        );
      }
      setAcceptanceResult(result);
    } catch {
      setAcceptanceResult(null);
      setFailedAcceptanceToken(token);
    }
  });

  useEffect(() => {
    if (
      !token ||
      !isAuthenticated ||
      preview?.status !== "ready" ||
      acceptanceResult !== null ||
      failedAcceptanceToken === token ||
      isAccepting
    ) {
      return;
    }
    void acceptOnce();
  }, [acceptOnce, acceptanceResult, failedAcceptanceToken, isAuthenticated, isAccepting, preview?.status, token]);

  const { run: startVerification, isRunning: isStartingVerification } = useSingleFlight(async (email: string) => {
    setVerificationError(null);
    setVerificationInfo(null);

    const parsed = requiredEmailSchema.safeParse(email);
    if (!parsed.success) {
      setVerificationError(parsed.error.issues[0]?.message ?? "メールアドレスを確認してください。");
      return;
    }
    if (!user || !isUserLoaded) {
      setVerificationError("アカウント情報を確認できませんでした。画面を更新して、もう一度お試しください。");
      return;
    }

    const normalizedEmail = normalizeEmail(parsed.data);
    try {
      const reloadedUser = await user.reload();
      let emailAddress = reloadedUser.emailAddresses.find(
        (candidate) => normalizeEmail(candidate.emailAddress) === normalizedEmail,
      );

      if (!emailAddress) {
        const createdEmailAddress = await createEmailAddress(normalizedEmail);
        if (createdEmailAddress == null) {
          setVerificationError("メールアドレスの追加を中止しました。もう一度お試しください。");
          return;
        }
        emailAddress = createdEmailAddress;
      }

      verificationEmailRef.current = emailAddress;
      setMaskedVerificationEmail(maskEmailAddress(emailAddress.emailAddress));

      if (emailAddress.verification.status === "verified") {
        await user.reload();
        await acceptOnce(true);
        return;
      }

      const preparedEmailAddress = await emailAddress.prepareVerification({ strategy: "email_code" });
      verificationEmailRef.current = preparedEmailAddress;
      setVerificationStep("code");
    } catch (error) {
      if (isReverificationCancelledError(error)) return;
      setVerificationError(getClerkErrorMessage(error));
    }
  });

  const { run: verifyCode, isRunning: isVerifyingCode } = useSingleFlight(async (code: string) => {
    setVerificationError(null);
    setVerificationInfo(null);

    const emailAddress = verificationEmailRef.current;
    if (!emailAddress || !user) {
      setVerificationStep("input");
      setVerificationError("確認するメールアドレスをもう一度入力してください。");
      return;
    }

    try {
      const verifiedEmailAddress = await emailAddress.attemptVerification({ code });
      verificationEmailRef.current = verifiedEmailAddress;
      if (verifiedEmailAddress.verification.status !== "verified") {
        setVerificationError("メールアドレスを確認できませんでした。確認コードをもう一度お確かめください。");
        return;
      }

      await user.reload();
      await acceptOnce(true);
    } catch (error) {
      setVerificationError(getClerkErrorMessage(error));
    }
  });

  const { run: resendCode, isRunning: isResendingCode } = useSingleFlight(async () => {
    setVerificationError(null);
    setVerificationInfo(null);

    const emailAddress = verificationEmailRef.current;
    if (!emailAddress) {
      setVerificationStep("input");
      setVerificationError("確認するメールアドレスをもう一度入力してください。");
      return;
    }

    try {
      const preparedEmailAddress = await emailAddress.prepareVerification({ strategy: "email_code" });
      verificationEmailRef.current = preparedEmailAddress;
      setVerificationInfo("確認コードを再送しました。");
    } catch (error) {
      setVerificationError(getClerkErrorMessage(error));
    }
  });

  const backToEmailInput = () => {
    verificationEmailRef.current = null;
    setMaskedVerificationEmail("");
    setVerificationStep("input");
    setVerificationError(null);
    setVerificationInfo(null);
  };

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
    verificationStep,
    verificationError,
    verificationInfo,
    maskedVerificationEmail,
    isVerifyingEmail: isStartingVerification || isVerifyingCode || isResendingCode || isAccepting,
  });

  return (
    <ManagerInvitationAcceptanceView
      state={state}
      actions={{
        onAccept: () => void acceptOnce(),
        onLogin: () => void navigate({ to: "/login", search: { redirect: invitationRedirect } }),
        onSignup: () => void navigate({ to: "/signup", search: { redirect: invitationRedirect } }),
        onStartVerification: (email) => void startVerification(email),
        onVerifyCode: ({ code }) => void verifyCode(code),
        onResendCode: () => void resendCode(),
        onBackToVerificationInput: backToEmailInput,
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
  acceptanceResult,
  linkedTarget,
  destinationShopFound,
  isDestinationLoading,
  isAccepting,
  didAcceptanceRequestFail,
  verificationStep,
  verificationError,
  verificationInfo,
  maskedVerificationEmail,
  isVerifyingEmail,
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
  verificationStep: VerificationStep;
  verificationError: string | null;
  verificationInfo: string | null;
  maskedVerificationEmail: string;
  isVerifyingEmail: boolean;
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
  if (acceptanceResult?.status === "verificationRequired") {
    return verificationStep === "code"
      ? {
          kind: "verificationRequired",
          step: "code",
          maskedEmail: maskedVerificationEmail,
          errorMessage: verificationError,
          infoMessage: verificationInfo,
          isBusy: isVerifyingEmail,
        }
      : {
          kind: "verificationRequired",
          step: "input",
          errorMessage: verificationError,
          isBusy: isVerifyingEmail,
        };
  }
  if (acceptanceResult?.status === "conflict") return { kind: "conflict", isAccepting };
  if (acceptanceResult?.status === "unavailable") {
    return acceptanceResult.retryable ? { kind: "retryableError", isRetrying: isAccepting } : { kind: "unavailable" };
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
  ManagerInvitationAcceptanceViewProps,
  ManagerInvitationAcceptanceViewState,
} from "./ManagerInvitationAcceptanceView";
export { ManagerInvitationAcceptanceView } from "./ManagerInvitationAcceptanceView";
