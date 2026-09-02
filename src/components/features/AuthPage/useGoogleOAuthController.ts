import { useCallback, useEffect, useRef } from "react";
import { withOpenExternalBrowser } from "@/convex/_lib/lineUrl";
import { getClerkErrorMessage } from "./errorPresentation";
import { type ResettableOAuthAttempt, resetOAuthAttempts } from "./resetOAuthAttempts";
import { isLineInAppBrowser } from "./script";

type RunAuthAction = (action: () => Promise<void>) => Promise<unknown>;

type UseGoogleOAuthControllerParams = {
  authenticateWithRedirect?: () => Promise<unknown>;
  isResourceLoaded: boolean;
  releaseAuthAction: () => void;
  runAuthAction: RunAuthAction;
  signIn?: ResettableOAuthAttempt;
  signUp?: ResettableOAuthAttempt;
  onErrorMessage: (message: string | undefined) => void;
};

export function useGoogleOAuthController({
  authenticateWithRedirect,
  isResourceLoaded,
  releaseAuthAction,
  runAuthAction,
  signIn,
  signUp,
  onErrorMessage,
}: UseGoogleOAuthControllerParams) {
  const isLineBrowser = isLineInAppBrowser(navigator.userAgent);
  const oauthAttemptGenerationRef = useRef(0);
  const isOAuthRedirectPendingRef = useRef(false);

  useEffect(() => {
    const releaseRestoredOAuthAction = (event: PageTransitionEvent) => {
      if (!event.persisted || !isOAuthRedirectPendingRef.current) return;

      oauthAttemptGenerationRef.current += 1;
      isOAuthRedirectPendingRef.current = false;
      releaseAuthAction();
    };

    window.addEventListener("pageshow", releaseRestoredOAuthAction);
    return () => window.removeEventListener("pageshow", releaseRestoredOAuthAction);
  }, [releaseAuthAction]);

  const handleGoogle = useCallback(async () => {
    await runAuthAction(async () => {
      // LINE内ブラウザではGoogle OAuthがブロックされるため、同じ認証URLを外部ブラウザで開き直す。
      if (isLineBrowser) {
        window.location.assign(withOpenExternalBrowser(window.location.href));
        return;
      }

      if (!isResourceLoaded || !authenticateWithRedirect || !signIn || !signUp) return;

      const oauthAttemptGeneration = ++oauthAttemptGenerationRef.current;
      onErrorMessage(undefined);
      try {
        await resetOAuthAttempts({ signIn, signUp });
        isOAuthRedirectPendingRef.current = true;
        await authenticateWithRedirect();
      } catch (error) {
        if (oauthAttemptGenerationRef.current === oauthAttemptGeneration) {
          onErrorMessage(getClerkErrorMessage(error));
        }
      } finally {
        if (oauthAttemptGenerationRef.current === oauthAttemptGeneration) {
          isOAuthRedirectPendingRef.current = false;
        }
      }
    });
  }, [authenticateWithRedirect, isLineBrowser, isResourceLoaded, onErrorMessage, runAuthAction, signIn, signUp]);

  return { handleGoogle, isLineBrowser };
}
