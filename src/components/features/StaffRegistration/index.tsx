import { useCallback, useState } from "react";
import type { StaffRegistrationFormData } from "@/convex/staffRegistration/schemas";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { VERIFICATION_REQUIRED_MESSAGE } from "@/src/components/shared/TurnstileWidget";
import { TURNSTILE_SITE_KEY } from "@/src/configs/publicEnv";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { StaffRegistrationFlow } from "./StaffRegistrationFlow";
import { submitStaffRegistrationRequest } from "./submitStaffRegistrationRequest";
import type { StaffRegistrationPageData } from "./types";

type Props = {
  token: string | undefined;
  data: StaffRegistrationPageData;
};

export function StaffRegistration({ token, data }: Props) {
  const [isSubmitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const handleVerified = useCallback((verifiedToken: string) => {
    setTurnstileToken(verifiedToken);
    setVerificationError(null);
  }, []);

  // 失敗の案内と再試行は確認欄が表示するため、ここでは使えなくなったtokenだけを捨てる。
  const handleVerificationError = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const { run: handleSubmit, isRunning: isSubmitting } = useSingleFlight(
    async (formData: StaffRegistrationFormData) => {
      if (!token) return;
      if (!turnstileToken) {
        // site key未設定なら確認欄が読み込めない旨を表示するため、待機案内を重ねない。
        if (TURNSTILE_SITE_KEY) setVerificationError(VERIFICATION_REQUIRED_MESSAGE);
        return;
      }

      try {
        await submitStaffRegistrationRequest({
          token,
          name: formData.name,
          email: formData.email,
          acceptedLegal: formData.acceptedLegal,
          turnstileToken,
          requestId: crypto.randomUUID(),
        });
        setSubmitted(true);
        showSuccessToast({ title: "スタッフ登録申請を受け付けました" });
      } catch (error) {
        showErrorToast(error);
        setTurnstileToken("");
        setTurnstileKey((current) => current + 1);
      }
    },
  );

  return (
    <StaffRegistrationFlow
      data={data}
      isSubmitting={isSubmitting}
      isSubmitted={isSubmitted}
      onSubmit={handleSubmit}
      turnstile={{
        widgetKey: turnstileKey,
        siteKey: TURNSTILE_SITE_KEY,
        onError: handleVerificationError,
        onVerify: handleVerified,
      }}
      verificationError={verificationError}
    />
  );
}

export type { StaffRegistrationPageData } from "./types";
