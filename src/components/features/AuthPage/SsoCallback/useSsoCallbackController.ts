import { useClerk, useSignIn, useSignUp } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { getClerkErrorMessage } from "../errorPresentation";

type SignInCallbackResource = Pick<
  ReturnType<typeof useSignIn>["signIn"],
  "status" | "isTransferable" | "existingSession" | "create" | "finalize"
>;
type SignUpCallbackResource = Pick<
  ReturnType<typeof useSignUp>["signUp"],
  "status" | "isTransferable" | "existingSession" | "create" | "finalize"
>;
type NavigateToApp = NonNullable<NonNullable<Parameters<SignInCallbackResource["finalize"]>[0]>["navigate"]>;

export type SsoCallbackResources = {
  clerk: Pick<ReturnType<typeof useClerk>, "setActive">;
  signIn: SignInCallbackResource;
  signUp: SignUpCallbackResource;
};

export type SsoCallbackNavigation = {
  navigateToApp: NavigateToApp;
  continueSignIn: () => void;
  continueSignUp: () => void;
};

export type SsoCallbackContinuation = "sign-in" | "sign-up";

async function expectClerkSuccess(operation: Promise<{ error: unknown | null }>) {
  const { error } = await operation;
  if (error) throw error;
}

export async function handleSsoCallback(
  { clerk, signIn, signUp }: SsoCallbackResources,
  { continueSignIn, continueSignUp, navigateToApp }: SsoCallbackNavigation,
) {
  if (signIn.status === "complete") {
    await expectClerkSuccess(signIn.finalize({ navigate: navigateToApp }));
    return;
  }

  if (signUp.isTransferable) {
    await expectClerkSuccess(signIn.create({ transfer: true }));
    // Core 3 mutates the Signal resource after create; discard the pre-await status narrowing.
    if ((signIn.status as string) === "complete") {
      await expectClerkSuccess(signIn.finalize({ navigate: navigateToApp }));
      return;
    }
    continueSignIn();
    return;
  }

  if (
    signIn.status === "needs_first_factor" ||
    signIn.status === "needs_second_factor" ||
    signIn.status === "needs_client_trust" ||
    signIn.status === "needs_new_password" ||
    signIn.status === "needs_protect_check"
  ) {
    continueSignIn();
    return;
  }

  if (signIn.isTransferable) {
    await expectClerkSuccess(signUp.create({ transfer: true }));
    if ((signUp.status as string) === "complete") {
      await expectClerkSuccess(signUp.finalize({ navigate: navigateToApp }));
      return;
    }
    continueSignUp();
    return;
  }

  if (signUp.status === "complete") {
    await expectClerkSuccess(signUp.finalize({ navigate: navigateToApp }));
    return;
  }

  const existingSessionId = signIn.existingSession?.sessionId ?? signUp.existingSession?.sessionId;
  if (existingSessionId) {
    await clerk.setActive({ session: existingSessionId, navigate: navigateToApp });
    return;
  }

  if (signUp.status === "missing_requirements") {
    continueSignUp();
    return;
  }

  throw new Error("SSO callback could not continue from the current authentication state");
}

export function useSsoCallbackController({ redirectTo }: { redirectTo: string }) {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const hasRun = useRef(false);
  const [continuation, setContinuation] = useState<SsoCallbackContinuation>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    if (!clerk.loaded || hasRun.current) return;
    hasRun.current = true;

    void handleSsoCallback(
      { clerk, signIn, signUp },
      {
        navigateToApp: ({ decorateUrl }) => {
          window.location.assign(decorateUrl(redirectTo));
        },
        continueSignIn: () => {
          setContinuation("sign-in");
          setIsProcessing(false);
        },
        continueSignUp: () => {
          setContinuation("sign-up");
          setIsProcessing(false);
        },
      },
    ).catch((error) => {
      setErrorMessage(getClerkErrorMessage(error));
      setIsProcessing(false);
    });
  }, [clerk, clerk.loaded, redirectTo, signIn, signUp]);

  return { continuation, errorMessage, isProcessing };
}
