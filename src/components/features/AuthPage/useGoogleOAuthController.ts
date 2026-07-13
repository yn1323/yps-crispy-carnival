import { useCallback } from "react";
import { withOpenExternalBrowser } from "@/convex/_lib/lineUrl";
import { getClerkErrorMessage } from "./errorPresentation";
import { isLineInAppBrowser } from "./script";

type RunAuthAction = (action: () => Promise<void>) => Promise<unknown>;

type UseGoogleOAuthControllerParams = {
  authenticateWithRedirect?: () => Promise<unknown>;
  isResourceLoaded: boolean;
  runAuthAction: RunAuthAction;
  onErrorMessage: (message: string | undefined) => void;
};

export function useGoogleOAuthController({
  authenticateWithRedirect,
  isResourceLoaded,
  runAuthAction,
  onErrorMessage,
}: UseGoogleOAuthControllerParams) {
  const isLineBrowser = isLineInAppBrowser(navigator.userAgent);

  const handleGoogle = useCallback(async () => {
    await runAuthAction(async () => {
      // LINE内ブラウザではGoogle OAuthがブロックされるため、同じ認証URLを外部ブラウザで開き直す。
      if (isLineBrowser) {
        window.location.assign(withOpenExternalBrowser(window.location.href));
        return;
      }

      if (!isResourceLoaded || !authenticateWithRedirect) return;

      onErrorMessage(undefined);
      try {
        await authenticateWithRedirect();
      } catch (error) {
        onErrorMessage(getClerkErrorMessage(error));
      }
    });
  }, [authenticateWithRedirect, isLineBrowser, isResourceLoaded, onErrorMessage, runAuthAction]);

  return { handleGoogle, isLineBrowser };
}
