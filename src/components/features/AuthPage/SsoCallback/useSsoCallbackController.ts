import { useClerk } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { getClerkErrorMessage } from "../errorPresentation";

export function useSsoCallbackController() {
  const clerk = useClerk();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    clerk
      .handleRedirectCallback({
        signInUrl: "/login",
        signUpUrl: "/signup",
        signInFallbackRedirectUrl: "/dashboard",
        signUpFallbackRedirectUrl: "/dashboard",
        continueSignUpUrl: "/signup",
        resetPasswordUrl: "/forgot-password",
      })
      .catch((error) => {
        setErrorMessage(getClerkErrorMessage(error));
        setIsProcessing(false);
      });
  }, [clerk]);

  return { errorMessage, isProcessing };
}
